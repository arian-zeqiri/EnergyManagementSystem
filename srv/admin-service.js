const cds = require('@sap/cds');

/**
 * Implementation for AdminService
 */
module.exports = cds.service.impl(async function () {
    // Get the entities from the model
    const {
        Users,
        SolarPanelConfigurations,
        EnergyUsages,
        EnergyRates,
        Calculations,
        SolarSupplies
    } = this.entities;

    // Before read handler for SolarPanelConfigurations
    this.before('READ', SolarPanelConfigurations, async (req) => {
        console.log('Reading SolarPanelConfigurations with authorization check');

        // Check if user has Admin role
        const isAuthorized = req.user.is('Admin');
        if (!isAuthorized) {
            req.reject(403, 'Not authorized. Requires Admin role.');
        }
    });

    // Helper function to enrich configuration data
    function enrichConfigData(config) {
        if (config) {
            // Add computed total power property
            if (config.PanelAmount && config.ModulePower) {
                config.TotalPower = config.PanelAmount * config.ModulePower;
            }
        }
    }

    // After read handler to enhance configuration data
    this.after('READ', SolarPanelConfigurations, async (configs, req) => {
        console.log('After READ handler called for SolarPanelConfigurations');
        
        // If no results, just return
        if (!configs) return configs;
        
        // Process array of configs (list view)
        if (Array.isArray(configs)) {
            console.log(`Processing ${configs.length} configurations in list view`);
            
            // Get all user IDs in one array
            const userIds = [];
            configs.forEach(config => {
                if (config.User_ID && !userIds.includes(config.User_ID)) {
                    userIds.push(config.User_ID);
                }
            });
            
            // Fetch all user data at once
            if (userIds.length > 0) {
                try {
                    console.log(`Fetching data for ${userIds.length} users`);
                    const users = await SELECT.from(Users).where({ ID: { in: userIds } });
                    
                    // Create a map for quick lookup
                    const userMap = {};
                    users.forEach(user => {
                        userMap[user.ID] = user;
                    });
                    
                    // Add user data to each configuration
                    configs.forEach(config => {
                        // Add computed data
                        enrichConfigData(config);
                        
                        // Add user data if available
                        if (config.User_ID && userMap[config.User_ID]) {
                            const user = userMap[config.User_ID];
                            config.UserEmail = user.Email;
                            config.UserFirstname = user.Firstname;
                            config.UserLastname = user.Lastname;
                            config.UserContractType = user.ContractType;
                        }
                    });
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }
            } else {
                // Just enrich with computed data
                configs.forEach(enrichConfigData);
            }
        } 
        // Process single config (detail view)
        else {
            enrichConfigData(configs);
        }
        
        return configs;
    });

    // Handle specific requests for configuration details with related solar supplies
    this.on('READ', 'SolarPanelConfigurations', async (req, next) => {
        // For specific record by ID
        if (req.data && req.data.ID) {
            try {
                // Get the configuration first
                let config = await SELECT.one
                    .from(SolarPanelConfigurations)
                    .where({ ID: req.data.ID });

                if (config) {
                    // Calculate total power
                    if (config.PanelAmount && config.ModulePower) {
                        config.TotalPower = config.PanelAmount * config.ModulePower;
                    }

                    // Get user details
                    if (config.User_ID) {
                        const user = await SELECT.one
                            .from(Users)
                            .where({ ID: config.User_ID });

                        if (user) {
                            config.UserEmail = user.Email;
                            config.UserFirstname = user.Firstname;
                            config.UserLastname = user.Lastname;
                            config.UserContractType = user.ContractType;
                            console.log(`Added user data to config: ${user.Email}`);
                        }
                    }

                    // Get supplies
                    const supplies = await SELECT
                        .from(SolarSupplies)
                        .where({ Configuration_ID: req.data.ID })
                        .orderBy({ Date: 'desc', Time: 'desc' });

                    config.Supplies = supplies || [];

                    console.log(`Retrieved configuration ${req.data.ID} with ${supplies.length} supplies`);
                }

                return config;
            } catch (error) {
                console.error('Error reading SolarPanelConfiguration:', error);
                return req.error(500, `Database error: ${error.message}`);
            }
        }

        // For collection/list view - handle standard processing
        const result = await next();
        
        // If result is an array, fill in user data
        if (Array.isArray(result) && result.length > 0) {
            // Get all user IDs
            const userIds = [];
            result.forEach(config => {
                if (config.User_ID && !userIds.includes(config.User_ID)) {
                    userIds.push(config.User_ID);
                }
            });
            
            // Fetch user data
            if (userIds.length > 0) {
                const users = await SELECT.from(Users).where({ ID: { in: userIds } });
                const userMap = {};
                users.forEach(user => {
                    userMap[user.ID] = user;
                });
                
                // Add user data to results
                result.forEach(config => {
                    if (config.User_ID && userMap[config.User_ID]) {
                        config.UserEmail = userMap[config.User_ID].Email;
                    }
                });
            }
        }
        
        return result;
    });

    // Implementation for getAllConfigurations function
    this.on('getAllConfigurations', async () => {
        try {
            const configurations = await SELECT.from(SolarPanelConfigurations);

            // Get user IDs
            if (configurations && Array.isArray(configurations)) {
                const userIds = [];
                configurations.forEach(config => {
                    if (config.User_ID && !userIds.includes(config.User_ID)) {
                        userIds.push(config.User_ID);
                    }
                });
                
                // Fetch user data
                if (userIds.length > 0) {
                    const users = await SELECT.from(Users).where({ ID: { in: userIds } });
                    const userMap = {};
                    users.forEach(user => {
                        userMap[user.ID] = user;
                    });
                    
                    // Add user data to results
                    configurations.forEach(config => {
                        enrichConfigData(config);
                        if (config.User_ID && userMap[config.User_ID]) {
                            const user = userMap[config.User_ID];
                            config.UserEmail = user.Email;
                            config.UserFirstname = user.Firstname;
                            config.UserLastname = user.Lastname;
                            config.UserContractType = user.ContractType;
                        }
                    });
                } else {
                    configurations.forEach(enrichConfigData);
                }
            }

            console.log(`Retrieved ${configurations.length} configurations`);
            return configurations;
        } catch (error) {
            console.error('Error retrieving all configurations:', error);
            throw new Error('Internal server error during configurations retrieval');
        }
    });

    // Implementation for getConfigurationDetails function
    this.on('getConfigurationDetails', async (req) => {
        console.log('getConfigurationDetails called with data:', req.data);

        // Make sure to access the ID parameter correctly
        const id = req.data?.id || '';

        if (!id) {
            console.error('Missing ID parameter');
            throw new Error('Configuration ID is required');
        }

        try {
            // Get configuration
            const config = await SELECT.one.from(SolarPanelConfigurations).where({ ID: id });

            if (!config) {
                throw new Error('Configuration not found');
            }

            // Enrich with computed data
            enrichConfigData(config);
            
            // Get user details
            if (config.User_ID) {
                const user = await SELECT.one.from(Users).where({ ID: config.User_ID });
                if (user) {
                    config.UserEmail = user.Email;
                    config.UserFirstname = user.Firstname;
                    config.UserLastname = user.Lastname;
                    config.UserContractType = user.ContractType;
                }
            }

            // Get related solar supplies
            const supplies = await SELECT.from(SolarSupplies)
                .where({ Configuration_ID: id });

            // Add supplies to the config
            config.Supplies = supplies || [];

            console.log(`Retrieved configuration ${id}`);
            return config;
        } catch (error) {
            console.error(`Error retrieving configuration details for ${id}:`, error);
            throw new Error(`Error retrieving configuration details: ${error.message}`);
        }
    });

    // Provide a custom action to get user with their configurations
    this.on('getUserWithConfigurations', async (req) => {
        const userId = req.data.userId;

        if (!userId) {
            return req.reject(400, 'User ID is required');
        }

        try {
            const user = await SELECT.one.from(Users).where({ ID: userId });

            if (!user) {
                return req.reject(404, 'User not found');
            }

            const configs = await SELECT.from(SolarPanelConfigurations).where({ User_ID: userId });
            user.Configurations = configs;

            return user;
        } catch (error) {
            console.error('Error retrieving user details:', error);
            return req.reject(500, 'Internal server error during user retrieval');
        }
    });
});