const cds = require('@sap/cds');
const cron = require('node-cron');
const axios = require('axios');
const xml2js = require('xml2js');

cds.on('served', async () => {
    console.log('[SCHEDULER] Initializing schedulers...');

    // Helper function to normalize timestamps to UTC hour
    const normalizeToUTCHour = (timestamp) => {
        const date = new Date(timestamp);
        const utcDate = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            0, 0, 0
        ));
        return utcDate.toISOString();
    };

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

            // Get all users
            const users = await SELECT.from(Users);
            console.log(`[SCHEDULER] Found ${users.length} users`);

            let successCount = 0;
            let errorCount = 0;

            for (const user of users) {
                try {
                    console.log(`[SCHEDULER] Processing user ${user.ID}`);

                    // IMPORTANT: First fetch Solar Forecast, then Energy Rates
                    const solarResult = await fetchSolarForecast(db, WeatherForecast, SolarPanelConfigurations, user.ID);
                    console.log(`[SCHEDULER] Solar forecast: ${solarResult} new records`);

                    const ratesResult = await fetchAllEnergyRates(db, EnergyRates, user.ID);
                    console.log(`[SCHEDULER] Energy rates: ${ratesResult} new records`);

                    successCount++;

                } catch (error) {
                    console.error(`[SCHEDULER] Error for user ${user.ID}:`, error.message);
                    errorCount++;

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

    // Fetch solar forecast
    async function fetchSolarForecast(db, WeatherForecast, SolarPanelConfigurations, userId) {
        try {
            // Check if we already have recent data
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1); // add 1 day

            const existingTodayData = await SELECT.one.from(WeatherForecast)
                .where({
                    User_ID: userId,
                    DateTime: { '>=': today.toISOString() }
                });

            const existingTomorrowData = await SELECT.one.from(WeatherForecast)
                .where({
                    User_ID: userId,
                    DateTime: { '>=': tomorrow.toISOString() }
                });

            if (existingTodayData && existingTomorrowData) {
                console.log(`[SCHEDULER] Recent solar data already exists for user ${userId}, skipping`);
                return 0;
            }

            // Get configuration
            const userConfig = await SELECT.one.from(SolarPanelConfigurations)
                .where({ User_ID: userId });

            let lat, lon, dec, az, kwp;
            if (userConfig) {
                lat = userConfig.Latitude || 51.260197;
                lon = userConfig.Longitude || 4.402771;
                dec = userConfig.PanelAngle || 37;
                az = userConfig.PanelAzimuth || 0;
                const totalWatts = (userConfig.ModulePower || 400) * (userConfig.PanelAmount || 1);
                kwp = totalWatts / 1000;
            } else {
                lat = 51.260197; lon = 4.402771; dec = 37; az = 0; kwp = 1;
            }

            const apiUrl = `https://api.forecast.solar/estimate/watthours/period/${lat}/${lon}/${dec}/${az}/${kwp}`;
            console.log(`[SCHEDULER] Solar API URL: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'User-Agent': 'EnergyManagementSystem/1.0' }
            });

            if (!response.data || !response.data.result) {
                throw new Error('No data from Forecast.solar API');
            }

            let wattHours = response.data.result.watt_hours_period ||
                response.data.result.watt_hours ||
                response.data.result;

            // Get existing forecasts
            const existingForecasts = await SELECT.from(WeatherForecast)
                .where({ User_ID: userId })
                .columns(['DateTime']);

            const existingTimestamps = new Set(
                existingForecasts.map(f => normalizeToUTCHour(f.DateTime))
            );

            const forecasts = [];
            for (const [datetime, wattValue] of Object.entries(wattHours)) {
                const dateTimeObj = new Date(datetime.replace(' ', 'T'));
                const utcDateTime = normalizeToUTCHour(dateTimeObj);

                if (!existingTimestamps.has(utcDateTime)) {
                    forecasts.push({
                        ID: cds.utils.uuid(),
                        DateTime: utcDateTime,
                        Watts: wattValue,
                        User_ID: userId
                    });
                }
            }

            if (forecasts.length > 0) {
                await INSERT.into(WeatherForecast).entries(forecasts);
            }

            return forecasts.length;

        } catch (error) {
            console.error('[SCHEDULER] Solar forecast error:', error.message);
            throw error;
        }
    }

    // In scheduler.js - Use LOCAL time for ENTSO-E API

    const fetchPeriod = async (startDate, endDate, periodName) => {
        try {
            // ENTSO-E expects LOCAL TIME (CET/CEST) in YYYYMMDDHHMM format
            const formatDateLocal = (date) => {
                // Create a new date in local timezone
                const localDate = new Date(date);
                const year = localDate.getFullYear();
                const month = String(localDate.getMonth() + 1).padStart(2, '0');
                const day = String(localDate.getDate()).padStart(2, '0');
                const hours = String(localDate.getHours()).padStart(2, '0');
                const minutes = String(localDate.getMinutes()).padStart(2, '0');
                return `${year}${month}${day}${hours}${minutes}`;
            };

            const periodStart = formatDateLocal(startDate);
            const periodEnd = formatDateLocal(endDate);

            console.log(`[SCHEDULER] Fetching ${periodName}: ${periodStart} to ${periodEnd}`);

            const apiUrl = `https://web-api.tp.entsoe.eu/api?securityToken=c9e81213-21ea-4989-b86f-77348d8f4b39&documentType=A44&in_Domain=10YBE----------2&out_Domain=10YBE----------2&periodStart=${periodStart}&periodEnd=${periodEnd}`;

            const response = await axios.get(apiUrl, {
                headers: {
                    'Accept': 'application/xml',
                    'Content-Type': 'application/xml'
                },
                timeout: 30000
            });

            // ... rest of the code ...
        } catch (error) {
            console.log(`[SCHEDULER] Error fetching ${periodName}:`, error.message);
            return 0;
        }
    };

    // Complete implementation of fetchPeriod function for scheduler.js

    // Fetch ALL available energy rates
    async function fetchAllEnergyRates(db, EnergyRates, userId) {
        try {
            console.log('[SCHEDULER] Fetching all available energy rates...');

            const now = new Date();
            let totalRatesAdded = 0;

            // Helper function to fetch rates for a period - COMPLETE IMPLEMENTATION
            const fetchPeriod = async (startDate, endDate, periodName) => {
                try {
                    // ENTSO-E expects LOCAL TIME (CET/CEST) in YYYYMMDDHHMM format
                    const formatDateLocal = (date) => {
                        const localDate = new Date(date);
                        const year = localDate.getFullYear();
                        const month = String(localDate.getMonth() + 1).padStart(2, '0');
                        const day = String(localDate.getDate()).padStart(2, '0');
                        const hours = String(localDate.getHours()).padStart(2, '0');
                        const minutes = String(localDate.getMinutes()).padStart(2, '0');
                        return `${year}${month}${day}${hours}${minutes}`;
                    };

                    const periodStart = formatDateLocal(startDate);
                    const periodEnd = formatDateLocal(endDate);

                    console.log(`[SCHEDULER] Fetching ${periodName}: ${periodStart} to ${periodEnd}`);

                    const apiUrl = `https://web-api.tp.entsoe.eu/api?securityToken=c9e81213-21ea-4989-b86f-77348d8f4b39&documentType=A44&in_Domain=10YBE----------2&out_Domain=10YBE----------2&periodStart=${periodStart}&periodEnd=${periodEnd}`;

                    const response = await axios.get(apiUrl, {
                        headers: {
                            'Accept': 'application/xml',
                            'Content-Type': 'application/xml'
                        },
                        timeout: 30000
                    });

                    console.log(`[SCHEDULER] Response status for ${periodName}: ${response.status}`);

                    // Check for error response
                    if (response.data.includes('Acknowledgement_MarketDocument')) {
                        const parser = new xml2js.Parser({ explicitArray: false });
                        const errorResult = await parser.parseStringPromise(response.data);
                        if (errorResult.Acknowledgement_MarketDocument?.Reason) {
                            const errorText = errorResult.Acknowledgement_MarketDocument.Reason.text || 'Unknown error';
                            console.log(`[SCHEDULER] ENTSO-E Error for ${periodName}: ${errorText}`);

                            if (errorText.includes('No matching data found')) {
                                console.log(`[SCHEDULER] No data available for ${periodName}`);
                                return 0;
                            }
                            throw new Error(`ENTSO-E API Error: ${errorText}`);
                        }
                    }

                    // Parse the successful response
                    const parser = new xml2js.Parser({ explicitArray: false });
                    const result = await parser.parseStringPromise(response.data);

                    // Get existing rates
                    const existingRates = await SELECT.from(EnergyRates)
                        .where({ User_ID: userId })
                        .columns(['DateTime']);

                    const existingTimestamps = new Set(
                        existingRates.map(r => normalizeToUTCHour(r.DateTime))
                    );

                    // Map to collect rates per UTC hour
                    const hourlyRates = new Map();

                    if (result.Publication_MarketDocument?.TimeSeries) {
                        const timeSeries = Array.isArray(result.Publication_MarketDocument.TimeSeries)
                            ? result.Publication_MarketDocument.TimeSeries
                            : [result.Publication_MarketDocument.TimeSeries];

                        console.log(`[SCHEDULER] Found ${timeSeries.length} time series for ${periodName}`);

                        for (const series of timeSeries) {
                            if (series.Period?.Point) {
                                const points = Array.isArray(series.Period.Point)
                                    ? series.Period.Point
                                    : [series.Period.Point];

                                const periodStartDate = new Date(series.Period.timeInterval.start);
                                const resolution = series.Period.resolution;

                                console.log(`[SCHEDULER] Processing ${points.length} points for ${periodName}`);

                                for (const point of points) {
                                    const position = parseInt(point.position) - 1;
                                    const dateTime = new Date(periodStartDate);

                                    // Calculate the actual timestamp for this point
                                    if (resolution === 'PT15M') {
                                        dateTime.setUTCMinutes(dateTime.getUTCMinutes() + (position * 15));
                                    } else if (resolution === 'PT60M' || resolution === 'PT1H') {
                                        dateTime.setUTCHours(dateTime.getUTCHours() + position);
                                    }

                                    const normalizedUTCDateTime = normalizeToUTCHour(dateTime);
                                    const price = parseFloat(point['price.amount']);

                                    // Collect hourly rates (average if multiple values per hour)
                                    if (hourlyRates.has(normalizedUTCDateTime)) {
                                        const existing = hourlyRates.get(normalizedUTCDateTime);
                                        const avgPrice = (existing.price + price) / 2;
                                        hourlyRates.set(normalizedUTCDateTime, {
                                            price: avgPrice,
                                            count: existing.count + 1
                                        });
                                    } else {
                                        hourlyRates.set(normalizedUTCDateTime, { price, count: 1 });
                                    }
                                }
                            }
                        }
                    } else {
                        console.log(`[SCHEDULER] No TimeSeries found in response for ${periodName}`);
                    }

                    // Convert to database entries
                    const rates = [];
                    for (const [normalizedUTCDateTime, rateData] of hourlyRates) {
                        if (!existingTimestamps.has(normalizedUTCDateTime)) {
                            const roundedPrice = Math.round(rateData.price * 10000) / 10000;
                            rates.push({
                                ID: cds.utils.uuid(),
                                DateTime: normalizedUTCDateTime,
                                Price: roundedPrice,
                                User_ID: userId
                            });
                        }
                    }

                    if (rates.length > 0) {
                        await INSERT.into(EnergyRates).entries(rates);
                        console.log(`[SCHEDULER] Inserted ${rates.length} new rates for ${periodName}`);
                    } else {
                        console.log(`[SCHEDULER] No new rates to insert for ${periodName} (all already exist)`);
                    }

                    return rates.length;

                } catch (error) {
                    if (error.response) {
                        console.log(`[SCHEDULER] HTTP Error ${error.response.status} for ${periodName}`);
                        if (error.response.status === 503) {
                            console.log('[SCHEDULER] Service temporarily unavailable - will retry later');
                        } else if (error.response.status === 429) {
                            console.log('[SCHEDULER] Rate limit exceeded - will retry later');
                        } else if (error.response.status === 400) {
                            console.log(`[SCHEDULER] Bad request for ${periodName} - check date format`);
                        }
                    }
                    console.log(`[SCHEDULER] Error fetching ${periodName}:`, error.message);
                    return 0;
                }
            };

            // Yesterday and today combined (as in your current code)
            const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);

            totalRatesAdded += await fetchPeriod(yesterdayStart, todayEnd, 'yesterday-today');

            // Tomorrow (if after 14:00 local time)
            if (now.getHours() >= 14) {
                const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
                const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 0, 0, 0);

                totalRatesAdded += await fetchPeriod(tomorrowStart, tomorrowEnd, 'tomorrow');
            } else {
                console.log('[SCHEDULER] Before 14:00 local time - tomorrow\'s prices not yet available');
            }

            return totalRatesAdded;

        } catch (error) {
            console.error('[SCHEDULER] Energy rates error:', error.message);
            throw error;
        }
    }

    // Check for existing data on startup
    setTimeout(async () => {
        try {
            const db = await cds.connect.to('db');
            const { WeatherForecast, EnergyRates } = db.entities('com.ss.energysystem');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Check if we have any data for today
            const existingSolarData = await SELECT.one.from(WeatherForecast)
                .where({ DateTime: { '>=': today.toISOString() } });

            const existingRatesData = await SELECT.one.from(EnergyRates)
                .where({ DateTime: { '>=': today.toISOString() } });

            if (!existingSolarData || !existingRatesData) {
                console.log('[SCHEDULER] Missing data detected, running initial refresh...');
                await refreshAllUsersData();
            } else {
                console.log('[SCHEDULER] Recent data already exists');

                // Check if it's after 14:00 and we need tomorrow's rates
                const now = new Date();
                const currentHourCET = (now.getUTCHours() + 1) % 24;

                if (currentHourCET >= 14) {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);

                    const tomorrowRates = await SELECT.one.from(EnergyRates)
                        .where({ DateTime: { '>=': tomorrow.toISOString() } });

                    if (!tomorrowRates) {
                        console.log('[SCHEDULER] After 14:00 but missing tomorrow\'s rates, fetching...');
                        await refreshAllUsersData();
                    }
                }
            }
        } catch (error) {
            console.error('[SCHEDULER] Error checking existing data:', error);
        }
    }, 10000); // 10 seconds after start

    // Schedule daily at midnight
    cron.schedule('0 0 * * *', () => {
        console.log('[SCHEDULER] Running scheduled midnight refresh...');
        refreshAllUsersData();
    });

    // Schedule at 14:00 CET for tomorrow's energy prices
    cron.schedule('0 13 * * *', () => { // 13:00 UTC = 14:00 CET (winter time)
        console.log('[SCHEDULER] Running 14:00 CET energy rates fetch...');
        refreshAllUsersData();
    });

    // For development: also at noon
    if (process.env.NODE_ENV !== 'production') {
        cron.schedule('0 12 * * *', () => {
            console.log('[SCHEDULER] Running noon refresh (dev only)...');
            refreshAllUsersData();
        });

        // Log every hour for debugging
        cron.schedule('0 * * * *', () => {
            const now = new Date();
            const currentHourCET = (now.getUTCHours() + 1) % 24;
            console.log(`[SCHEDULER] Hourly check - Current time: ${currentHourCET}:00 CET`);
        });
    }

    console.log('[SCHEDULER] Cron jobs initialized successfully');
    console.log('[SCHEDULER] Scheduled times:');
    console.log('[SCHEDULER] - Daily at midnight (00:00)');
    console.log('[SCHEDULER] - Daily at 14:00 CET for tomorrow\'s prices');
    if (process.env.NODE_ENV !== 'production') {
        console.log('[SCHEDULER] - Daily at noon (12:00) - development only');
        console.log('[SCHEDULER] - Hourly status check - development only');
    }
});

module.exports = cds.server;