const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = async (srv) => {
    const { Users, SolarPanelConfigurations, EnergyRates } = cds.entities('com.ss.energysystem');

    // Get current user's email from JWT token
    function _getUserEmail(req) {
        console.log("User object:", JSON.stringify(req.user));

        const userEmail = req.user?.id;

        console.log("Detected email:", userEmail);

        if (!userEmail) {
            console.warn('User email not found in authentication token');
        }
        return userEmail;
    }

    // Reusable function to get user by email
    async function _getUserByEmail(email) {
        return await SELECT.one.from(Users).where({ Email: email });
    }

    // Handle standard READ operations on SolarConfigurations entity
    srv.on('READ', 'SolarConfigurations', async (req, next) => {
        // If you want to filter by the current user
        const userEmail = _getUserEmail(req);
        const user = await _getUserByEmail(userEmail);
        
        if (user) {
            // Add a filter to only show configurations for the current user
            req.query.where('User_ID =', user.ID);
        }
        
        // Continue with default handling
        return next();
    });

    // Handle standard READ operations on UserProfile entity
    srv.on('READ', 'UserProfile', async (req, next) => {
        // If you want to filter by the current user
        const userEmail = _getUserEmail(req);
        
        if (userEmail) {
            // Add a filter to only show the current user's profile
            req.query.where('Email =', userEmail);
        }
        
        // Continue with default handling
        return next();
    });

    // Handle standard READ operations on userEnergyRate entity
    srv.on('READ', 'userEnergyRate', async (req, next) => {
        // If you want to filter by the current user
        const userEmail = _getUserEmail(req);
        const user = await _getUserByEmail(userEmail);
        
        if (user) {
            // Add a filter to only show rates for the current user
            req.query.where('User_ID =', user.ID);
        }
        
        // Continue with default handling
        return next();
    });

    // Function: Get current user profile - No transaction needed for read-only
    srv.on('getUserProfile', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);

            if (!user) {
                // Return empty object if user not found (new user)
                return {
                    Email: userEmail,
                    Firstname: '',
                    Lastname: '',
                    ContractType: 'variable' // Default value
                };
            }

            return user;
        } catch (error) {
            console.error("Error in getUserProfile:", error);
            req.error({
                code: 'USER_PROFILE_ERROR',
                message: error.message
            });
        }
    });

    // Function: Get current Energy Rate if contractype === Fixed - No transaction needed for read-only
    srv.on('getuserEnergyRate', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);

            if (!user) {
                return null; // No user found
            }

            if (user.ContractType !== 'fixed') {
                return null; // Only return rates for fixed contract types
            }

            const energyRate = await SELECT.one.from(EnergyRates)
                .where({ User_ID: user.ID });

            return energyRate || null;
        } catch (error) {
            console.error("Error in getuserEnergyRate:", error);
            return null;
        }
    });

    // Function: Get current user's solar configuration - No transaction needed for read-only
    srv.on('getUserSolarConfig', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);

            if (!user) {
                return null; // No user found
            }

            // Get solar config without transaction
            const config = await SELECT.one.from(SolarPanelConfigurations)
                .where({ User_ID: user.ID });

            return config || null;
        } catch (error) {
            console.error("Error in getUserSolarConfig:", error);
            return null; // Return null on error to avoid disrupting the UI
        }
    });

    // Action: Update user profile
    srv.on('updateUserProfile', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const { firstName, lastName, contractType } = req.data;

            console.log(`Updating profile for ${userEmail}:`, req.data);

            // Check if user exists
            const existingUser = await _getUserByEmail(userEmail);

            let resultObj;

            if (existingUser) {
                // Update existing user
                await UPDATE(Users)
                    .set({
                        Firstname: firstName,
                        Lastname: lastName,
                        ContractType: contractType
                    })
                    .where({ ID: existingUser.ID });

                // Create result object (don't query again)
                resultObj = {
                    ID: existingUser.ID,
                    Email: userEmail,
                    Firstname: firstName,
                    Lastname: lastName,
                    ContractType: contractType
                };

                console.log(`Updated user ${existingUser.ID}`);
            } else {
                // Insert new user
                const result = await INSERT.into(Users).entries({
                    Email: userEmail,
                    Firstname: firstName,
                    Lastname: lastName,
                    ContractType: contractType
                });

                // Try to get ID from the result, or get it from a query
                let userId = result?.ID;
                if (!userId) {
                    const newUser = await _getUserByEmail(userEmail);
                    userId = newUser?.ID;
                }

                // Create result object
                resultObj = {
                    ID: userId,
                    Email: userEmail,
                    Firstname: firstName,
                    Lastname: lastName,
                    ContractType: contractType
                };

                console.log(`Created new user with ID ${userId}`);
            }

            // No explicit commit - CAP will handle it

            // Return the result object
            return resultObj;

        } catch (error) {
            console.error("Error in updateUserProfile:", error);

            // Explicitly roll back on error
            req.error({
                code: 'UPDATE_USER_ERROR',
                message: error.message
            });
        }
    });

    // Action: Update user energy rate
    srv.on('updateUserEnergyRate', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            // Extract data from request
            const { Price } = req.data;
            
            console.log(`Updating energy rate for ${userEmail} with price ${Price}`);

            // Get user without explicit transaction
            const user = await _getUserByEmail(userEmail);

            if (!user) {
                throw new Error('User not found. Please update your profile first.');
            }

            // Check if contract type is fixed
            if (user.ContractType !== 'fixed') {
                throw new Error('Energy rate can only be updated for fixed contract types.');
            }

            // Get current date and time
            const currentDate = new Date();
            const date = currentDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
            const time = currentDate.toTimeString().split(' ')[0]; // Format: HH:MM:SS

            // Find existing energy rate
            const existingRate = await SELECT.one.from(EnergyRates)
                .where({ User_ID: user.ID });

            let resultObj;

            if (existingRate) {
                // Update existing rate with current date and time
                await UPDATE(EnergyRates)
                    .set({
                        Date: date,
                        Time: time,
                        Price: Price
                    })
                    .where({ ID: existingRate.ID });

                // Create result object
                resultObj = {
                    ID: existingRate.ID,
                    Date: date,
                    Time: time,
                    Price: Price,
                    User_ID: user.ID
                };

                console.log(`Updated energy rate ${existingRate.ID} with price ${Price}`);
            } else {
                // Voor een nieuwe energy rate moeten we een ID genereren of autoincrement laten werken
                // Aanpak 1: Laat database autoIncrement gebruiken
                
                // Create new rate with current date and time
                await INSERT.into(EnergyRates).entries({
                    // ID is autoIncrement, dus hoeft niet te worden opgegeven
                    Date: date,
                    Time: time,
                    Price: Price,
                    User_ID: user.ID
                });
                
                // Zoek de nieuwe record op met most recent ID
                const newRate = await SELECT.one.from(EnergyRates)
                    .where({ User_ID: user.ID })
                    .orderBy({ ID: 'desc' });
                
                if (!newRate) {
                    throw new Error('Failed to retrieve newly created energy rate');
                }

                // Create result object
                resultObj = {
                    ID: newRate.ID,
                    Date: date,
                    Time: time,
                    Price: Price,
                    User_ID: user.ID
                };

                console.log(`Created new energy rate with ID ${newRate.ID} and price ${Price}`);
            }

            // No explicit commit - let CAP handle it

            // Return the result
            return resultObj;

        } catch (error) {
            console.error("Error in updateUserEnergyRate:", error);

            req.error({
                code: 'UPDATE_RATE_ERROR',
                message: error.message
            });
        }
    });

    // Action: Update solar configuration
    srv.on('updateSolarConfig', async (req) => {
        try {
            const userEmail = _getUserEmail(req);

            // Extract data from request
            const {
                panelAmount,
                modulePower,
                panelAngle,
                panelAzimuth,
                latitude,
                longitude,
                location
            } = req.data;

            console.log(`Updating solar config for ${userEmail}:`, req.data);

            // Get user without explicit transaction
            const user = await _getUserByEmail(userEmail);

            if (!user) {
                throw new Error('User not found. Please update your profile first.');
            }

            // Find existing configuration
            const existingConfig = await SELECT.one.from(SolarPanelConfigurations)
                .where({ User_ID: user.ID });

            let resultObj;

            if (existingConfig) {
                // Update existing configuration
                await UPDATE(SolarPanelConfigurations)
                    .set({
                        PanelAmount: panelAmount,
                        ModulePower: modulePower,
                        PanelAngle: panelAngle,
                        PanelAzimuth: panelAzimuth,
                        Latitude: latitude,
                        Longitude: longitude,
                        Location: location
                    })
                    .where({ ID: existingConfig.ID });

                // Create result object
                resultObj = {
                    ID: existingConfig.ID,
                    PanelAmount: panelAmount,
                    ModulePower: modulePower,
                    PanelAngle: panelAngle,
                    PanelAzimuth: panelAzimuth,
                    Latitude: latitude,
                    Longitude: longitude,
                    Location: location,
                    User_ID: user.ID
                };

                console.log(`Updated solar config ${existingConfig.ID}`);
            } else {
                // Create new configuration with UUID
                const configId = uuidv4();
                
                await INSERT.into(SolarPanelConfigurations).entries({
                    ID: configId,
                    PanelAmount: panelAmount,
                    ModulePower: modulePower,
                    PanelAngle: panelAngle,
                    PanelAzimuth: panelAzimuth,
                    Latitude: latitude,
                    Longitude: longitude,
                    Location: location,
                    User_ID: user.ID
                });

                // Create result object
                resultObj = {
                    ID: configId,
                    PanelAmount: panelAmount,
                    ModulePower: modulePower,
                    PanelAngle: panelAngle,
                    PanelAzimuth: panelAzimuth,
                    Latitude: latitude,
                    Longitude: longitude,
                    Location: location,
                    User_ID: user.ID
                };

                console.log(`Created new solar config with ID ${configId}`);
            }

            // No explicit commit - let CAP handle it

            // Return the result
            return resultObj;

        } catch (error) {
            console.error("Error in updateSolarConfig:", error);

            // Just throw the error for CAP to handle
            req.error({
                code: 'UPDATE_CONFIG_ERROR',
                message: error.message
            });
        }
    });
};