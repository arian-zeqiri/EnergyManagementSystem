const cds = require('@sap/cds');
const cron = require('node-cron');
const axios = require('axios');
const xml2js = require('xml2js');

cds.on('served', async () => {
    console.log('[SCHEDULER] Initializing schedulers...');
    
    // Direct database operations
    async function refreshAllUsersData() {
        try {
            console.log('[SCHEDULER] Starting forecast data refresh...');
            
            const db = await cds.connect.to('db');
            const { 
                Users, 
                WeatherForecast, 
                EnergyRates,
                SolarPanelConfigurations
            } = db.entities('com.ss.energysystem');
            
            // Haal alle users op
            const users = await SELECT.from(Users);
            console.log(`[SCHEDULER] Found ${users.length} users`);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const user of users) {
                try {
                    console.log(`[SCHEDULER] Processing user ${user.ID}`);
                    
                    // Fetch Solar Forecast
                    const solarResult = await fetchSolarForecast(db, WeatherForecast, SolarPanelConfigurations, user.ID);
                    console.log(`[SCHEDULER] Solar forecast: ${solarResult} new records`);
                    
                    // Fetch Energy Rates
                    const ratesResult = await fetchEnergyRates(db, EnergyRates, user.ID);
                    console.log(`[SCHEDULER] Energy rates: ${ratesResult} new records`);
                    
                    successCount++;
                    
                } catch (error) {
                    console.error(`[SCHEDULER] Error for user ${user.ID}:`, error.message);
                    errorCount++;
                    
                    // Stop bij rate limit error
                    if (error.response && error.response.status === 429) {
                        console.error('[SCHEDULER] Rate limit reached, stopping further requests');
                        break;
                    }
                }
            }
            
            console.log(`[SCHEDULER] Refresh completed: ${successCount} success, ${errorCount} errors`);
            
        } catch (error) {
            console.error('[SCHEDULER] Error in refresh job:', error);
        }
    }
    
    async function fetchSolarForecast(db, WeatherForecast, SolarPanelConfigurations, userId) {
        try {
            // Check eerst of er al recente data is (vandaag)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const existingTodayData = await SELECT.one.from(WeatherForecast)
                .where({ 
                    User_ID: userId,
                    DateTime: { '>=': today.toISOString() }
                });
                
            if (existingTodayData) {
                console.log(`[SCHEDULER] Recent solar data already exists for user ${userId}, skipping`);
                return 0;
            }
            
            // Haal configuratie op
            const userConfig = await SELECT.one.from(SolarPanelConfigurations)
                .where({ User_ID: userId });
            
            let lat, lon, dec, az, kwp;
            
            if (userConfig) {
                console.log(`[SCHEDULER] User config found:`, {
                    ModulePower: userConfig.ModulePower,
                    PanelAmount: userConfig.PanelAmount,
                    PanelAngle: userConfig.PanelAngle,
                    PanelAzimuth: userConfig.PanelAzimuth
                });
                
                lat = userConfig.Latitude || 51.260197;
                lon = userConfig.Longitude || 4.402771;
                dec = userConfig.PanelAngle || 37;
                az = userConfig.PanelAzimuth || 0;
                
                // Bereken kWp
                const totalWatts = (userConfig.ModulePower || 400) * (userConfig.PanelAmount || 1);
                kwp = totalWatts / 1000;
                
                console.log(`[SCHEDULER] Calculated kWp: ${totalWatts}W / 1000 = ${kwp} kWp`);
            } else {
                // Default waarden
                lat = 51.260197;
                lon = 4.402771;
                dec = 37;
                az = 0;
                kwp = 1;
                
                console.log(`[SCHEDULER] No configuration found for user ${userId}, using defaults (1 kWp)`);
            }

            const apiUrl = `https://api.forecast.solar/estimate/${lat}/${lon}/${dec}/${az}/${kwp}`;
            
            console.log(`[SCHEDULER] API URL: ${apiUrl}`);
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'EnergyManagementSystem/1.0'
                }
            });
            
            if (!response.data || !response.data.result) {
                throw new Error('No data from Forecast.solar API');
            }

            const forecasts = [];
            const watts = response.data.result.watts;
            
            // Log sample data
            const sampleEntries = Object.entries(watts).slice(0, 3);
            console.log(`[SCHEDULER] Sample API response:`, sampleEntries);
            
            // Check existing forecasts
            const existingForecasts = await SELECT.from(WeatherForecast)
                .where({ User_ID: userId })
                .columns(['DateTime']);
            
            const existingTimestamps = new Set(
                existingForecasts.map(f => new Date(f.DateTime).toISOString())
            );
            
            for (const [datetime, wattValue] of Object.entries(watts)) {
                const dateTimeObj = new Date(datetime.replace(' ', 'T'));
                const isoDateTime = dateTimeObj.toISOString();
                
                if (!existingTimestamps.has(isoDateTime)) {
                    forecasts.push({
                        ID: cds.utils.uuid(),
                        DateTime: isoDateTime,
                        Watts: wattValue,
                        User_ID: userId
                    });
                }
            }
            
            if (forecasts.length > 0) {
                await INSERT.into(WeatherForecast).entries(forecasts);
                return forecasts.length;
            }
            
            return 0;
            
        } catch (error) {
            console.error('[SCHEDULER] Solar forecast error:', error.message);
            throw error;
        }
    }
    
    async function fetchEnergyRates(db, EnergyRates, userId) {
        try {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const formatDate = (date) => {
                return date.toISOString().slice(0, 10).replace(/-/g, '') + '0000';
            };

            const periodStart = formatDate(today);
            const periodEnd = formatDate(tomorrow);

            const apiUrl = `https://web-api.tp.entsoe.eu/api?securityToken=c9e81213-21ea-4989-b86f-77348d8f4b39&documentType=A44&in_Domain=10YBE----------2&out_Domain=10YBE----------2&periodStart=${periodStart}&periodEnd=${periodEnd}`;
            
            console.log(`[SCHEDULER] Fetching energy rates from ENTSO-E API...`);
            
            const response = await axios.get(apiUrl, {
                headers: { 'Accept': 'application/xml' },
                timeout: 30000
            });

            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(response.data);
            
            const rates = [];
            
            // Check existing rates
            const existingRates = await SELECT.from(EnergyRates)
                .where({ User_ID: userId })
                .columns(['DateTime']);
            
            const existingTimestamps = new Set(
                existingRates.map(r => new Date(r.DateTime).toISOString())
            );
            
            if (result.Publication_MarketDocument && result.Publication_MarketDocument.TimeSeries) {
                const timeSeries = Array.isArray(result.Publication_MarketDocument.TimeSeries) 
                    ? result.Publication_MarketDocument.TimeSeries 
                    : [result.Publication_MarketDocument.TimeSeries];
                
                for (const series of timeSeries) {
                    if (series.Period && series.Period.Point) {
                        const points = Array.isArray(series.Period.Point) 
                            ? series.Period.Point 
                            : [series.Period.Point];
                        
                        const periodStartDate = new Date(series.Period.timeInterval.start);
                        const resolution = series.Period.resolution;
                        
                        for (const point of points) {
                            const position = parseInt(point.position) - 1;
                            const dateTime = new Date(periodStartDate);
                            
                            if (resolution === 'PT15M') {
                                dateTime.setMinutes(dateTime.getMinutes() + (position * 15));
                            } else if (resolution === 'PT60M') {
                                dateTime.setHours(dateTime.getHours() + position);
                            }
                            
                            const isoDateTime = dateTime.toISOString();
                            
                            if (!existingTimestamps.has(isoDateTime)) {
                                let price = parseFloat(point['price.amount']);
                                price = Math.round(price * 10000) / 10000;
                                
                                rates.push({
                                    ID: cds.utils.uuid(),
                                    DateTime: isoDateTime,
                                    Price: price,
                                    User_ID: userId
                                });
                            }
                        }
                    }
                }
            }
            
            if (rates.length > 0) {
                await INSERT.into(EnergyRates).entries(rates);
                return rates.length;
            }
            
            return 0;
            
        } catch (error) {
            console.error('[SCHEDULER] Energy rates error:', error.message);
            throw error;
        }
    }
    
    // Check voor bestaande data bij opstarten
    setTimeout(async () => {
        try {
            const db = await cds.connect.to('db');
            const { WeatherForecast } = db.entities('com.ss.energysystem');
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const existingData = await SELECT.one.from(WeatherForecast)
                .where({ DateTime: { '>=': today.toISOString() } });
            
            if (!existingData) {
                console.log('[SCHEDULER] No recent data found, running initial refresh...');
                refreshAllUsersData();
            } else {
                console.log('[SCHEDULER] Recent data already exists, skipping initial refresh');
            }
        } catch (error) {
            console.error('[SCHEDULER] Error checking existing data:', error);
        }
    }, 10000); // 10 seconden na start
    
    // Schedule daily at midnight
    cron.schedule('0 0 * * *', () => {
        console.log('[SCHEDULER] Running scheduled midnight refresh...');
        refreshAllUsersData();
    });
    
    // Voor development: ook om 12:00 (middag) - OPTIONAL
    if (process.env.NODE_ENV !== 'production') {
        cron.schedule('0 12 * * *', () => {
            console.log('[SCHEDULER] Running scheduled noon refresh...');
            refreshAllUsersData();
        });
        
        // Test cron - comment uit voor productie
        console.log('[SCHEDULER] Development mode - extra schedules active');
    }
    
    console.log('[SCHEDULER] Cron jobs initialized successfully');
    console.log('[SCHEDULER] Scheduled times:');
    console.log('[SCHEDULER] - Daily at midnight (00:00)');
    if (process.env.NODE_ENV !== 'production') {
        console.log('[SCHEDULER] - Daily at noon (12:00) - development only');
    }
});

module.exports = cds.server;