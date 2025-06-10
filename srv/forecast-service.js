const cds = require('@sap/cds');
const axios = require('axios');
const xml2js = require('xml2js');

module.exports = cds.service.impl(async function () {
    const { Forecasts, EnergyRates, Users } = this.entities;
    const { WeatherForecast, SolarPanelConfigurations } = cds.entities('com.ss.energysystem');

    // FILTER: Toon alleen data van eigen user
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

        // Debug: Check hoeveel records er zijn zonder filter
        const allRecords = await SELECT.from(WeatherForecast);
        console.log(`[DEBUG] Total WeatherForecast records in DB: ${allRecords.length}`);
        
        const userRecords = await SELECT.from(WeatherForecast).where({ User_ID: userId });
        console.log(`[DEBUG] Records for user ${userId}: ${userRecords.length}`);

        // Log a sample record to see the structure
        if (userRecords.length > 0) {
            console.log(`[DEBUG] Sample record:`, JSON.stringify(userRecords[0], null, 2));
        }

        // Store userId for later use in after handler
        req.query._userId = userId;

        // Eenvoudigere filter - gebruik CDS where syntax
        req.query.where(`User_ID = '${userId}'`);
    });

    // After READ: Voeg energieprijzen toe
    this.after('READ', Forecasts, async (forecasts, req) => {
        if (!forecasts) return;

        const forecastArray = Array.isArray(forecasts) ? forecasts : [forecasts];
        if (forecastArray.length === 0) return;

        // Gebruik userId uit before handler of haal uit forecast data
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
            // Haal energy rates op voor deze user
            const energyRates = await SELECT.from(EnergyRates)
                .where({ User_ID: userId });

            console.log(`[AFTER READ] Found ${energyRates.length} energy rates for user ${userId}`);

            // Map per uur voor snelle lookup
            const rateMap = new Map();
            energyRates.forEach(rate => {
                const hourKey = new Date(rate.DateTime).toISOString().slice(0, 13);
                rateMap.set(hourKey, rate.Price);
            });

            console.log(`[AFTER READ] Rate map has ${rateMap.size} entries`);

            // Voeg prijzen toe aan forecasts
            let pricesAdded = 0;
            forecastArray.forEach(forecast => {
                const forecastHourKey = new Date(forecast.DateTime).toISOString().slice(0, 13);
                const price = rateMap.get(forecastHourKey);

                if (price !== undefined) {
                    forecast.EnergyPrice = price;
                    pricesAdded++;
                } else {
                    forecast.EnergyPrice = null;
                }
            });

            console.log(`[AFTER READ] Added prices to ${pricesAdded}/${forecastArray.length} forecasts`);

        } catch (error) {
            console.error('[AFTER READ] Error adding energy prices:', error);
        }
    });

    // Action: Refresh forecast data
    this.on('refreshForecastData', async (req) => {
        try {
            console.log('[REFRESH] Starting data refresh...');
            
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
                    return req.error(404, 'Geen gebruikers gevonden');
                }
                userId = firstUser.ID;
                console.log(`[REFRESH] Using first user for development: ${userId}`);
            }

            const user = await SELECT.one.from(Users).where({ ID: userId });
            if (!user) {
                return req.error(404, 'Gebruiker niet gevonden');
            }

            console.log(`[REFRESH] Refreshing data for user ${userId}`);

            // Fetch beide data sets
            const [solarResult, ratesResult] = await Promise.all([
                this._fetchSolarForecast(userId),
                this._fetchEnergyRates(userId)
            ]);

            console.log(`[REFRESH] Results: ${solarResult.count} solar, ${ratesResult.count} rates`);

            return `Data succesvol vernieuwd: ${solarResult.count} solar forecasts, ${ratesResult.count} energy rates`;

        } catch (error) {
            console.error('[REFRESH] Error refreshing forecast data:', error);
            return req.error(500, `Fout bij verversen data: ${error.message}`);
        }
    });

    // Private functie: Haal solar forecast op
    this._fetchSolarForecast = async function (userId) {
        try {
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

                console.log(`[ACTION] Calculated kWp: ${totalWatts}W / 1000 = ${kwp} kWp`);
            } else {
                lat = 51.260197;
                lon = 4.402771;
                dec = 37;
                az = 0;
                kwp = 1;

                console.log(`[ACTION] No configuration found for user ${userId}, using defaults (1 kWp)`);
            }

            // BUG FIX: Gebruik het juiste endpoint voor wattuur data
            const apiUrl = `https://api.forecast.solar/estimate/watthours/period/${lat}/${lon}/${dec}/${az}/${kwp}`;

            console.log(`[ACTION] API URL: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'EnergyManagementSystem/1.0'
                }
            });

            if (!response.data || !response.data.result) {
                throw new Error('Geen data ontvangen van Forecast.solar API');
            }

            const forecasts = [];
            // De API geeft wattuur data terug in result object
            let wattHours;
            
            if (response.data.result.watt_hours_period) {
                wattHours = response.data.result.watt_hours_period;
            } else if (response.data.result.watt_hours) {
                wattHours = response.data.result.watt_hours;
            } else {
                // Als backup, gebruik het hele result object
                wattHours = response.data.result;
            }

            console.log('API response keys:', Object.keys(response.data.result));
            console.log('Using watt hours data:', Object.keys(wattHours).length, 'entries');

            // Check welke timestamps al bestaan
            const existingForecasts = await SELECT.from(WeatherForecast)
                .where({ User_ID: userId })
                .columns(['DateTime']);

            const existingTimestamps = new Set(
                existingForecasts.map(f => new Date(f.DateTime).toISOString())
            );

            for (const [datetime, wattValue] of Object.entries(wattHours)) {
                const dateTimeObj = new Date(datetime.replace(' ', 'T'));
                const isoDateTime = dateTimeObj.toISOString();

                if (existingTimestamps.has(isoDateTime)) {
                    console.log(`Skipping existing timestamp: ${isoDateTime}`);
                    continue;
                }

                console.log(`Adding new forecast: ${isoDateTime} -> ${wattValue}W`);

                forecasts.push({
                    ID: cds.utils.uuid(),
                    DateTime: isoDateTime,
                    Watts: wattValue,
                    User_ID: userId
                });
            }

            console.log(`Total forecasts to insert: ${forecasts.length}`);

            if (forecasts.length > 0) {
                await INSERT.into(WeatherForecast).entries(forecasts);
                console.log(`Inserted ${forecasts.length} new weather forecasts for user ${userId}`);
            }

            return { count: forecasts.length };

        } catch (error) {
            console.error('Error fetching solar forecast:', error.message);
            throw error;
        }
    };

    // Private functie: Haal energy rates op
    this._fetchEnergyRates = async function (userId) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const formatDate = (date) => {
            return date.toISOString().slice(0, 10).replace(/-/g, '') + '0000';
        };

        const periodStart = formatDate(today);
        const periodEnd = formatDate(tomorrow);

        const apiUrl = `https://web-api.tp.entsoe.eu/api?securityToken=c9e81213-21ea-4989-b86f-77348d8f4b39&documentType=A44&in_Domain=10YBE----------2&out_Domain=10YBE----------2&periodStart=${periodStart}&periodEnd=${periodEnd}`;

        try {
            const response = await axios.get(apiUrl, {
                headers: { 'Accept': 'application/xml' },
                timeout: 30000
            });

            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(response.data);

            const rates = [];

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
                console.log(`Inserted ${rates.length} new energy rates for user ${userId}`);
            }

            return { count: rates.length };

        } catch (error) {
            console.error('Error fetching energy rates:', error.message);
            throw error;
        }
    };
});