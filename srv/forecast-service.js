const cds = require('@sap/cds');
const axios = require('axios');
const xml2js = require('xml2js');

module.exports = cds.service.impl(async function () {
    const { Forecasts, EnergyRates, Users } = this.entities;
    const { WeatherForecast, SolarPanelConfigurations } = cds.entities('com.ss.energysystem');

    // Helper function to normalize timestamps to UTC hour (fixes timezone issues)
    const normalizeToUTCHour = (timestamp) => {
        const date = new Date(timestamp);
        // Ensure we work in UTC to avoid timezone shifts
        const utcDate = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            0, 0, 0  // Set minutes, seconds, milliseconds to 0
        ));
        return utcDate.toISOString();
    };

    // FILTER: Show only user's own data
    this.before('READ', Forecasts, async (req) => {
        const userInfo = req.user;
        let userId = userInfo?.id;

        if (userId && userId !== 'anonymous') {
            const user = await SELECT.one.from(Users).where({ Email: userId });
            if (user) userId = user.ID;
        }

        if (!userId) {
            const firstUser = await SELECT.one.from(Users);
            if (firstUser) userId = firstUser.ID;
        }

        console.log(`[BEFORE READ] Filtering for user: ${userId}`);

        // Store userId for later use in after handler
        req.query._userId = userId;

        // Filter by user
        req.query.where(`User_ID = '${userId}'`);
    });

    // After READ: Add energy prices with timezone-aware timestamp synchronization
    this.after('READ', Forecasts, async (forecasts, req) => {
        if (!forecasts) return;

        const forecastArray = Array.isArray(forecasts) ? forecasts : [forecasts];
        if (forecastArray.length === 0) return;

        let userId = req.query._userId;
        if (!userId && forecastArray.length > 0) {
            userId = forecastArray[0].User_ID;
        }

        if (!userId) {
            console.log('[AFTER READ] No User_ID found - using first user');
            const firstUser = await SELECT.one.from(Users);
            if (firstUser) userId = firstUser.ID;
        }

        console.log(`[AFTER READ] Processing ${forecastArray.length} forecasts for user ${userId}`);

        try {
            // Get all energy rates for this user
            const energyRates = await SELECT.from(EnergyRates)
                .where({ User_ID: userId });

            console.log(`[AFTER READ] Found ${energyRates.length} energy rates for user ${userId}`);

            // Create a map with UTC-normalized hourly timestamps
            const rateMap = new Map();
            energyRates.forEach(rate => {
                const normalizedUTCHour = normalizeToUTCHour(rate.DateTime);

                if (!rateMap.has(normalizedUTCHour)) {
                    rateMap.set(normalizedUTCHour, rate.Price);
                }
            });

            console.log(`[AFTER READ] Rate map has ${rateMap.size} UTC hourly entries`);

            // Debug: Show sample mappings
            if (forecastArray.length > 0 && rateMap.size > 0) {
                const sampleForecast = forecastArray[0];
                const sampleForecastUTC = normalizeToUTCHour(sampleForecast.DateTime);
                const samplePrice = rateMap.get(sampleForecastUTC);
                console.log(`[AFTER READ] Sample mapping: ${sampleForecast.DateTime} -> UTC ${sampleForecastUTC} -> Price ${samplePrice}`);
            }

            // Match forecasts with rates using UTC-normalized timestamps
            let pricesAdded = 0;
            forecastArray.forEach(forecast => {
                const normalizedForecastUTC = normalizeToUTCHour(forecast.DateTime);
                const price = rateMap.get(normalizedForecastUTC);

                if (price !== undefined) {
                    forecast.EnergyPrice = price;
                    pricesAdded++;
                } else {
                    forecast.EnergyPrice = null;
                    const forecastDate = new Date(forecast.DateTime);
                    if (forecastDate > new Date()) {
                        // Only log missing prices for future dates
                        console.log(`[AFTER READ] No price for future date: ${normalizedForecastUTC}`);
                    }
                }
            });

            console.log(`[AFTER READ] Added prices to ${pricesAdded}/${forecastArray.length} forecasts using UTC matching`);

        } catch (error) {
            console.error('[AFTER READ] Error adding energy prices:', error);
        }
    });

    // Action: Refresh forecast data
    this.on('refreshForecastData', async (req) => {
        console.log('[REFRESH] ========== REFRESH ACTION CALLED ==========');
        try {
            const userInfo = req.user;
            let userId = req.data?.userId;

            if (!userId && userInfo) {
                if (userInfo.id && userInfo.id !== 'anonymous') {
                    const user = await SELECT.one.from(Users)
                        .where({ Email: userInfo.id });
                    if (user) userId = user.ID;
                }
            }

            if (!userId) {
                const firstUser = await SELECT.one.from(Users);
                if (!firstUser) {
                    console.error('[REFRESH] ERROR: No users found');
                    return req.error(404, 'Geen gebruikers gevonden');
                }
                userId = firstUser.ID;
            }

            console.log(`[REFRESH] Refreshing data for user ${userId}`);

            // IMPORTANT: First fetch solar forecast, then energy rates
            const solarResult = await this._fetchSolarForecast(userId);
            console.log(`[REFRESH] Solar result: ${solarResult.count} new forecasts`);
            
            const ratesResult = await this._fetchEnergyRates(userId);
            console.log(`[REFRESH] Rates result: ${ratesResult.count} new rates (${ratesResult.message || ''})`);

            const message = `Data succesvol vernieuwd: ${solarResult.count} solar forecasts, ${ratesResult.count} energy rates`;
            console.log(`[REFRESH] SUCCESS: ${message}`);
            return message;

        } catch (error) {
            console.error('[REFRESH] Error refreshing forecast data:', error);
            return req.error(500, `Fout bij verversen data: ${error.message}`);
        }
    });

    // Private function: Fetch solar forecast with UTC-normalized timestamps
    this._fetchSolarForecast = async function (userId) {
        try {
            console.log(`[SOLAR] Starting solar forecast fetch for user ${userId}`);

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
                lat = 51.260197;
                lon = 4.402771;
                dec = 37;
                az = 0;
                kwp = 1;
            }

            const apiUrl = `https://api.forecast.solar/estimate/watthours/period/${lat}/${lon}/${dec}/${az}/${kwp}`;
            console.log(`[SOLAR] API URL: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'User-Agent': 'EnergyManagementSystem/1.0' }
            });

            if (!response.data || !response.data.result) {
                throw new Error('Geen data ontvangen van Forecast.solar API');
            }

            let wattHours;
            if (response.data.result.watt_hours_period) {
                wattHours = response.data.result.watt_hours_period;
            } else if (response.data.result.watt_hours) {
                wattHours = response.data.result.watt_hours;
            } else {
                wattHours = response.data.result;
            }

            // Get existing forecasts with UTC-normalized timestamps
            const existingForecasts = await SELECT.from(WeatherForecast)
                .where({ User_ID: userId })
                .columns(['DateTime']);

            const existingTimestamps = new Set(
                existingForecasts.map(f => normalizeToUTCHour(f.DateTime))
            );

            const forecasts = [];
            for (const [datetime, wattValue] of Object.entries(wattHours)) {
                // Parse the datetime from Forecast.solar (should be local time)
                const dateTimeObj = new Date(datetime.replace(' ', 'T'));

                // IMPORTANT: Store as UTC to avoid timezone issues
                const utcDateTime = normalizeToUTCHour(dateTimeObj);

                if (existingTimestamps.has(utcDateTime)) {
                    console.log(`[SOLAR] Skipping existing UTC timestamp: ${utcDateTime}`);
                    continue;
                }

                console.log(`[SOLAR] Adding new forecast: ${datetime} -> UTC ${utcDateTime} -> ${wattValue}W`);

                forecasts.push({
                    ID: cds.utils.uuid(),
                    DateTime: utcDateTime,  // Store in UTC
                    Watts: wattValue,
                    User_ID: userId
                });
            }

            if (forecasts.length > 0) {
                await INSERT.into(WeatherForecast).entries(forecasts);
                console.log(`[SOLAR] Inserted ${forecasts.length} new weather forecasts for user ${userId} (UTC timestamps)`);
            }

            return { count: forecasts.length };

        } catch (error) {
            console.error('[SOLAR] Error fetching solar forecast:', error.message);
            throw error;
        }
    };

    // Private function: Fetch ALL available energy rates (past, present, future)
    this._fetchEnergyRates = async function (userId) {
        try {
            console.log('[RATES] ========== FETCHING ALL AVAILABLE ENERGY RATES ==========');

            const now = new Date();
            const currentHourUTC = now.getUTCHours();
            const currentHourCET = (currentHourUTC + 1) % 24; // CET = UTC+1 (winter)

            console.log(`[RATES] Current time: ${now.toISOString()}`);
            console.log(`[RATES] Current hour UTC: ${currentHourUTC}, CET: ${currentHourCET}`);

            let totalRatesAdded = 0;
            const messages = [];

            // 1. ALTIJD: Haal gisteren's data op (voor historische data)
            try {
                const yesterdayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 23, 0));
                const yesterdayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 0));
                
                const yesterdayCount = await this._fetchEnergyRatesForPeriod(userId, yesterdayStart, yesterdayEnd, 'yesterday');
                totalRatesAdded += yesterdayCount;
                if (yesterdayCount > 0) messages.push(`${yesterdayCount} for yesterday`);
            } catch (error) {
                console.log('[RATES] Could not fetch yesterday\'s rates:', error.message);
            }

            // 2. ALTIJD: Haal vandaag's data op
            try {
                const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 0));
                const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0));
                
                const todayCount = await this._fetchEnergyRatesForPeriod(userId, todayStart, todayEnd, 'today');
                totalRatesAdded += todayCount;
                if (todayCount > 0) messages.push(`${todayCount} for today`);
            } catch (error) {
                console.log('[RATES] Could not fetch today\'s rates:', error.message);
            }

            // 3. Als het na 14:00 CET is: haal morgen's data op
            if (currentHourCET >= 14) {
                try {
                    const tomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0));
                    const tomorrowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 23, 0));
                    
                    const tomorrowCount = await this._fetchEnergyRatesForPeriod(userId, tomorrowStart, tomorrowEnd, 'tomorrow');
                    totalRatesAdded += tomorrowCount;
                    if (tomorrowCount > 0) messages.push(`${tomorrowCount} for tomorrow`);
                } catch (error) {
                    console.log('[RATES] Could not fetch tomorrow\'s rates:', error.message);
                }
            } else {
                console.log('[RATES] Before 14:00 CET - tomorrow\'s prices not yet available');
                messages.push('tomorrow available after 14:00 CET');
            }

            const message = messages.length > 0 ? messages.join(', ') : 'all rates already up to date';

            return {
                count: totalRatesAdded,
                message: message
            };

        } catch (error) {
            console.error('[RATES] Error in main fetch:', error);
            throw error;
        }
    };

    // Helper function to fetch rates for a specific period
    this._fetchEnergyRatesForPeriod = async function(userId, startDate, endDate, periodName) {
        console.log(`[RATES] Fetching ${periodName} rates: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        
        const formatDate = (date) => {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const hours = String(date.getUTCHours()).padStart(2, '0');
            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
            return `${year}${month}${day}${hours}${minutes}`;
        };

        const periodStart = formatDate(startDate);
        const periodEnd = formatDate(endDate);

        const apiUrl = `https://web-api.tp.entsoe.eu/api?securityToken=c9e81213-21ea-4989-b86f-77348d8f4b39&documentType=A44&in_Domain=10YBE----------2&out_Domain=10YBE----------2&periodStart=${periodStart}&periodEnd=${periodEnd}`;

        const response = await axios.get(apiUrl, {
            headers: {
                'Accept': 'application/xml',
                'Content-Type': 'application/xml'
            },
            timeout: 30000
        });

        // Check for error response
        if (response.data.includes('Acknowledgement_MarketDocument')) {
            const parser = new xml2js.Parser({ explicitArray: false });
            const errorResult = await parser.parseStringPromise(response.data);
            if (errorResult.Acknowledgement_MarketDocument?.Reason) {
                const errorText = errorResult.Acknowledgement_MarketDocument.Reason.text || 'Unknown error';
                if (errorText.includes('No matching data found')) {
                    console.log(`[RATES] No data available for ${periodName}`);
                    return 0;
                }
                throw new Error(`ENTSO-E API Error: ${errorText}`);
            }
        }

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
                            dateTime.setUTCMinutes(dateTime.getUTCMinutes() + (position * 15));
                        } else if (resolution === 'PT60M' || resolution === 'PT1H') {
                            dateTime.setUTCHours(dateTime.getUTCHours() + position);
                        }

                        const normalizedUTCDateTime = normalizeToUTCHour(dateTime);
                        const price = parseFloat(point['price.amount']);

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
            console.log(`[RATES] Inserted ${rates.length} new rates for ${periodName}`);
        }

        return rates.length;
    };
});