const cds = require('@sap/cds');

module.exports = cds.service.impl(async function() {
    // Connect to the database
    const db = await cds.connect.to('db');
    
    // Reference the entity definitions from our database model
    const { 
        Users,
        SolarPanelConfigurations,
        SolarSupplies
    } = db.entities('com.ss.energysystem');

    // Auth check handler
    this.before('*', SolarPanelConfigurations, async (req) => {
        // Skip auth check for read operations that are handled by CDS annotations
        if (req.event === 'READ') return;
        
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
        return config;
    }

    // Calculate TotalPower virtual field
    this.after('READ', SolarPanelConfigurations, (results) => {
        if (Array.isArray(results)) {
            results.forEach(config => enrichConfigData(config));
        } else if (results) {
            enrichConfigData(results);
        }
        return results;
    });

    // Implementation for getAllConfigurations function
    this.on('getAllConfigurations', async () => {
        try {
            const configurations = await SELECT.from(SolarPanelConfigurations)
                .columns(c => {
                    c('*'),
                    c.User(u => {
                        u.Email,
                        u.Firstname,
                        u.Lastname,
                        u.ContractType
                    })
                });
            
            configurations.forEach(config => {
                enrichConfigData(config);
                if (config.User) {
                    config.UserEmail = config.User.Email;
                    config.UserFirstname = config.User.Firstname;
                    config.UserLastname = config.User.Lastname;
                    config.UserContractType = config.User.ContractType;
                }
            });
            
            return configurations;
        } catch (error) {
            console.error("Error retrieving configurations:", error);
            throw new Error(`Error retrieving configurations: ${error.message}`);
        }
    });

    // Implementation for getConfigurationDetails function - handling various parameter formats
    this.on('getConfigurationDetails', async (req) => {
        try {
            // Debug the entire request object to see its structure
            console.log("Request structure:", JSON.stringify({
                event: req.event,
                data: req.data,
                params: req.params,
                query: req.query
            }, null, 2));
            
            // Try to get the ID from different possible locations
            let id;
            
            // For OData V4 function import with parameter: /getConfigurationDetails(id=value)
            if (req.data && req.data.id) {
                id = req.data.id;
            } 
            // For OData V4 function import with parameter: /getConfigurationDetails(value)
            else if (req.params && req.params.length > 0) {
                id = req.params[0];
            }
            // For custom function calls
            else if (req._.odataReq && req._.odataReq.getQueryOptions()) {
                const options = req._.odataReq.getQueryOptions();
                id = options.id;
            }
            
            console.log("Resolved configuration ID:", id);
            
            if (!id) {
                throw new Error('Configuration ID is required');
            }
            
            const config = await SELECT.one.from(SolarPanelConfigurations)
                .columns(c => {
                    c('*'),
                    c.User(u => {
                        u.Email,
                        u.Firstname, 
                        u.Lastname,
                        u.ContractType
                    })
                })
                .where({ ID: id });
            
            if (!config) {
                throw new Error('Configuration not found');
            }
            
            // Calculate total power
            enrichConfigData(config);
            
            // Map user fields
            if (config.User) {
                config.UserEmail = config.User.Email;
                config.UserFirstname = config.User.Firstname;
                config.UserLastname = config.User.Lastname;
                config.UserContractType = config.User.ContractType;
            }
            
            // Get supplies
            const supplies = await SELECT.from(SolarSupplies).where({ Configuration_ID: id });
            config.Supplies = supplies || [];
            
            return config;
        } catch (error) {
            console.error("Error retrieving configuration details:", error);
            throw new Error(`Error retrieving configuration details: ${error.message}`);
        }
    });
    
    // Implementation for createConfiguration action
    this.on('createConfiguration', async (req) => {
        const { panelAmount, modulePower, orientation, userId } = req.data;
        
        if (!panelAmount || !modulePower || !orientation || !userId) {
            throw new Error('Missing required fields');
        }
        
        try {
            // Verify user exists
            const user = await SELECT.one.from(Users).where({ ID: userId });
            if (!user) {
                throw new Error('User not found');
            }
            
            // Create configuration
            const result = await INSERT.into(SolarPanelConfigurations).entries({
                PanelAmount: panelAmount,
                ModulePower: modulePower,
                Orientation: orientation,
                User_ID: userId
            });
            
            // Retrieve the created configuration with user details
            if (result && result.ID) {
                return await this.getConfigurationDetails({ data: { id: result.ID } });
            }
            
            throw new Error('Failed to create configuration');
        } catch (error) {
            console.error("Error creating configuration:", error);
            throw new Error(`Error creating configuration: ${error.message}`);
        }
    });
    
    // Implementation for updateConfiguration action
    this.on('updateConfiguration', async (req) => {
        const { id, panelAmount, modulePower, orientation } = req.data;
        
        if (!id) {
            throw new Error('Configuration ID is required');
        }
        
        try {
            // Verify configuration exists
            const config = await SELECT.one.from(SolarPanelConfigurations).where({ ID: id });
            if (!config) {
                throw new Error('Configuration not found');
            }
            
            // Update fields
            const updateData = {};
            if (panelAmount !== undefined) updateData.PanelAmount = panelAmount;
            if (modulePower !== undefined) updateData.ModulePower = modulePower;
            if (orientation !== undefined) updateData.Orientation = orientation;
            
            // Perform update
            await UPDATE(SolarPanelConfigurations).set(updateData).where({ ID: id });
            
            // Return updated configuration
            return await this.getConfigurationDetails({ data: { id } });
        } catch (error) {
            console.error("Error updating configuration:", error);
            throw new Error(`Error updating configuration: ${error.message}`);
        }
    });
    
    // Implementation for deleteConfiguration action
    this.on('deleteConfiguration', async (req) => {
        const id = req.data?.id;
        
        if (!id) {
            throw new Error('Configuration ID is required');
        }
        
        try {
            // Verify configuration exists
            const config = await SELECT.one.from(SolarPanelConfigurations).where({ ID: id });
            if (!config) {
                throw new Error('Configuration not found');
            }
            
            // Delete related supplies first
            await DELETE.from(SolarSupplies).where({ Configuration_ID: id });
            
            // Delete configuration
            await DELETE.from(SolarPanelConfigurations).where({ ID: id });
            
            return true;
        } catch (error) {
            console.error("Error deleting configuration:", error);
            throw new Error(`Error deleting configuration: ${error.message}`);
        }
    });
});