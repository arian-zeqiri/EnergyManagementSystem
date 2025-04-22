const cds = require('@sap/cds');

module.exports = async (srv) => {
    const { Users, SolarPanelConfigurations } = cds.entities('com.ss.energysystem');

    // Get current user's email from JWT token
    function _getUserEmail(req) {
        console.log("User object:", JSON.stringify(req.user));

        const userEmail = req.user?.email || req.user?.id || req.user?.mail ||
            req.user?.attr?.email || req.headers['x-user-email'];

        console.log("Detected email:", userEmail);

        if (!userEmail) {
            console.warn('User email not found in authentication token');
        }
        return userEmail;
    }

    // Function: Get current user profile - No transaction needed for read-only
    srv.on('getUserProfile', async (req) => {
        try {
            const userEmail = _getUserEmail(req);

            // Find user by email - using direct CDS query without transaction
            const user = await SELECT.one.from(Users).where({ Email: userEmail });

            if (!user) {
                // Return empty object if user not found (new user)
                return {
                    Email: userEmail,
                    Firstname: '',
                    Lastname: '',
                    ContractType: 'fixed' // Default value
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

    // Function: Get current user's solar configuration - No transaction needed for read-only
    srv.on('getUserSolarConfig', async (req) => {
        try {
            const userEmail = _getUserEmail(req);

            // Get user without transaction
            const user = await SELECT.one.from(Users).where({ Email: userEmail });

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
    // Action: Update user profile
    srv.on('updateUserProfile', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const { firstName, lastName, contractType } = req.data;

            console.log(`Updating profile for ${userEmail}:`, req.data);

            // Check if user exists
            const existingUser = await SELECT.one.from(Users).where({ Email: userEmail });

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
                    const newUser = await SELECT.one.from(Users).where({ Email: userEmail });
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

    // Action: Update solar configuration
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
            const user = await SELECT.one.from(Users).where({ Email: userEmail });

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
                // Create new configuration
                const result = await INSERT.into(SolarPanelConfigurations).entries({
                    PanelAmount: panelAmount,
                    ModulePower: modulePower,
                    PanelAngle: panelAngle,
                    PanelAzimuth: panelAzimuth,
                    Latitude: latitude,
                    Longitude: longitude,
                    Location: location,
                    User_ID: user.ID
                });

                // Get ID if available or query for it
                let configId = result?.ID;
                if (!configId) {
                    const newConfig = await SELECT.one.from(SolarPanelConfigurations)
                        .where({ User_ID: user.ID });
                    configId = newConfig?.ID;
                }

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