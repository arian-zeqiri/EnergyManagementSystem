const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
    const {
        Users,
        SolarPanelConfigurations,
        SolarSupplies
    } = this.entities;

    // Auth check
    this.before('READ', SolarPanelConfigurations, async (req) => {
        const isAuthorized = req.user.is('Admin');
        if (!isAuthorized) {
            req.reject(403, 'Not authorized. Requires Admin role.');
        }
    });

    // Helper function to calculate total power
    function enrichConfigData(config) {
        if (config && config.PanelAmount && config.ModulePower) {
            config.TotalPower = config.PanelAmount * config.ModulePower;
        }
    }

    // Direct handler for SolarPanelConfigurations
    this.on('READ', SolarPanelConfigurations, async (req, next) => {
        // Single record request
        if (req.data && req.data.ID) {
            try {
                // Get the configuration
                const config = await SELECT.one.from(SolarPanelConfigurations).where({ ID: req.data.ID });
                
                if (config) {
                    // Calculate total power
                    enrichConfigData(config);
                    
                    // Get user data
                    if (config.User_ID) {
                        const user = await SELECT.one.from(Users).where({ ID: config.User_ID });
                        if (user) {
                            config.UserEmail = user.Email;
                            config.UserFirstname = user.Firstname;
                            config.UserLastname = user.Lastname;
                            config.UserContractType = user.ContractType;
                        }
                    }
                    
                    // Get supplies
                    const supplies = await SELECT.from(SolarSupplies)
                        .where({ Configuration_ID: req.data.ID });
                    config.Supplies = supplies || [];
                }
                
                return config;
            } catch (error) {
                return req.error(500, `Error: ${error.message}`);
            }
        }
        
        // Collection request
        try {
            // Get all configurations
            const results = await next();
            
            if (results && Array.isArray(results)) {
                // Get all User_IDs
                const userIds = [];
                results.forEach(config => {
                    enrichConfigData(config);
                    if (config.User_ID && !userIds.includes(config.User_ID)) {
                        userIds.push(config.User_ID);
                    }
                });
                
                // Get all users in one query
                if (userIds.length > 0) {
                    const users = await SELECT.from(Users).where({ ID: { in: userIds } });
                    const userMap = {};
                    users.forEach(user => { userMap[user.ID] = user; });
                    
                    // Add user data to results
                    results.forEach(config => {
                        if (config.User_ID && userMap[config.User_ID]) {
                            const user = userMap[config.User_ID];
                            config.UserEmail = user.Email;
                            config.UserFirstname = user.Firstname;
                            config.UserLastname = user.Lastname;
                            config.UserContractType = user.ContractType;
                        }
                    });
                }
            }
            
            return results;
        } catch (error) {
            return req.error(500, `Error: ${error.message}`);
        }
    });

    // Implementation for getAllConfigurations function
    this.on('getAllConfigurations', async () => {
        try {
            const configurations = await SELECT.from(SolarPanelConfigurations);
            
            // Get all User_IDs
            const userIds = [];
            configurations.forEach(config => {
                enrichConfigData(config);
                if (config.User_ID && !userIds.includes(config.User_ID)) {
                    userIds.push(config.User_ID);
                }
            });
            
            // Get all users in one query
            if (userIds.length > 0) {
                const users = await SELECT.from(Users).where({ ID: { in: userIds } });
                const userMap = {};
                users.forEach(user => { userMap[user.ID] = user; });
                
                // Add user data to results
                configurations.forEach(config => {
                    if (config.User_ID && userMap[config.User_ID]) {
                        const user = userMap[config.User_ID];
                        config.UserEmail = user.Email;
                        config.UserFirstname = user.Firstname;
                        config.UserLastname = user.Lastname;
                        config.UserContractType = user.ContractType;
                    }
                });
            }
            
            return configurations;
        } catch (error) {
            throw new Error(`Error: ${error.message}`);
        }
    });

    // Implementation for getConfigurationDetails function
    this.on('getConfigurationDetails', async (req) => {
        const id = req.data?.id;
        
        if (!id) {
            throw new Error('Configuration ID is required');
        }
        
        try {
            const config = await SELECT.one.from(SolarPanelConfigurations).where({ ID: id });
            
            if (!config) {
                throw new Error('Configuration not found');
            }
            
            // Calculate total power
            enrichConfigData(config);
            
            // Get user data
            if (config.User_ID) {
                const user = await SELECT.one.from(Users).where({ ID: config.User_ID });
                if (user) {
                    config.UserEmail = user.Email;
                    config.UserFirstname = user.Firstname;
                    config.UserLastname = user.Lastname;
                    config.UserContractType = user.ContractType;
                }
            }
            
            // Get supplies
            const supplies = await SELECT.from(SolarSupplies).where({ Configuration_ID: id });
            config.Supplies = supplies || [];
            
            return config;
        } catch (error) {
            throw new Error(`Error: ${error.message}`);
        }
    });
});