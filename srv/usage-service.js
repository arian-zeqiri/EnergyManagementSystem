const cds = require('@sap/cds');

module.exports = cds.service.impl(async function() {
    // Connect to the database
    const db = await cds.connect.to('db');
    
    // Reference the entity definitions from our database model
    const { 
        Users,
        EnergyUsages,
        SolarSupplies,
        EnergyRates,
        SolarPanelConfigurations
    } = db.entities('com.ss.energysystem');
    
    // Get current user's email from JWT token
    function _getUserEmail(req) {
        const userEmail = req.user?.id;
        
        if (!userEmail) {
            console.warn('User email not found in authentication token');
        }
        return userEmail;
    }
    
    // Reusable function to get user by email
    async function _getUserByEmail(email) {
        if (!email) return null;
        return await SELECT.one.from(Users).where({ Email: email });
    }
    
    // Filter CustomerUsage data by current user
    this.before('READ', 'CustomerUsage', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);
            
            if (user) {
                req.query.where('User_ID =', user.ID);
            }
        } catch (error) {
            console.error("Error in CustomerUsage before handler:", error);
        }
    });
    
    // Filter CustomerGeneration data by current user's configurations
    this.before('READ', 'CustomerGeneration', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);
            
            if (user) {
                // Get user's configuration IDs
                const configs = await SELECT.from(SolarPanelConfigurations)
                    .where({ User_ID: user.ID });
                
                if (configs && configs.length > 0) {
                    const configIds = configs.map(c => c.ID);
                    req.query.where('Configuration_ID in', configIds);
                } else {
                    // No configurations found, return empty result
                    req.query.where('1=0');
                }
            }
        } catch (error) {
            console.error("Error in CustomerGeneration before handler:", error);
        }
    });
    
    // Calculate savings in the after handler
    this.after('READ', 'CustomerGeneration', async (data, req) => {
        if (!Array.isArray(data) || data.length === 0) return data;
        
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);
            
            if (!user) return data;
            
            // Get energy rate for the user
            let rate = 0;
            if (user.ContractType === 'fixed') {
                const energyRate = await SELECT.one.from(EnergyRates)
                    .where({ User_ID: user.ID });
                if (energyRate) {
                    rate = energyRate.Price;
                }
            } else {
                // For variable contracts, use a default rate
                rate = 0.25; // Example default rate
            }
            
            // Calculate savings for each entry
            data.forEach(item => {
                if (item.EnergyGenerated) {
                    item.Savings = parseFloat((item.EnergyGenerated * rate).toFixed(2));
                } else {
                    item.Savings = 0;
                }
            });
        } catch (error) {
            console.error("Error calculating savings:", error);
        }
        
        return data;
    });
    
    // Function: Get current user's usage data
    this.on('getCurrentUserUsage', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) return [];
            
            const user = await _getUserByEmail(userEmail);
            
            if (!user) {
                return []; // No user found
            }
            
            const usages = await SELECT.from(EnergyUsages)
                .where({ User_ID: user.ID })
                .orderBy({ Date: 'desc', Time: 'desc' });
                
            return usages || [];
        } catch (error) {
            console.error("Error in getCurrentUserUsage:", error);
            return [];
        }
    });
    
    // Function: Get current user's generation data
    this.on('getCurrentUserGeneration', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) return [];
            
            const user = await _getUserByEmail(userEmail);
            
            if (!user) {
                return []; // No user found
            }
            
            // Get user's configurations
            const configs = await SELECT.from(SolarPanelConfigurations)
                .where({ User_ID: user.ID });
                
            if (!configs || configs.length === 0) {
                return []; // No configurations found
            }
            
            const configIds = configs.map(c => c.ID);
            
            // Get generation data for these configurations
            const supplies = await SELECT.from(SolarSupplies)
                .where({ Configuration_ID: { in: configIds } })
                .orderBy({ Date: 'desc', Time: 'desc' });
                
            // Calculate savings
            let rate = 0;
            if (user.ContractType === 'fixed') {
                const energyRate = await SELECT.one.from(EnergyRates)
                    .where({ User_ID: user.ID });
                if (energyRate) {
                    rate = energyRate.Price;
                }
            } else {
                rate = 0.25; // Default rate for variable contracts
            }
            
            supplies.forEach(item => {
                if (item.EnergyGenerated) {
                    item.Savings = parseFloat((item.EnergyGenerated * rate).toFixed(2));
                } else {
                    item.Savings = 0;
                }
            });
            
            return supplies || [];
        } catch (error) {
            console.error("Error in getCurrentUserGeneration:", error);
            return [];
        }
    });
    
    // Function: Get usage summary by date
    this.on('getUserUsageSummary', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) return [];
            
            const user = await _getUserByEmail(userEmail);
            
            if (!user) {
                return []; // No user found
            }
            
            // Get user's usage data
            const usages = await SELECT.from(EnergyUsages)
                .where({ User_ID: user.ID });
                
            // Get user's configurations
            const configs = await SELECT.from(SolarPanelConfigurations)
                .where({ User_ID: user.ID });
                
            const summaryMap = new Map();
            
            // Add usage data to summary
            usages.forEach(usage => {
                const dateStr = usage.Date.toISOString().split('T')[0];
                
                if (!summaryMap.has(dateStr)) {
                    summaryMap.set(dateStr, {
                        date: usage.Date,
                        totalUsage: 0,
                        totalSupply: 0,
                        netUsage: 0,
                        savings: 0
                    });
                }
                
                const summary = summaryMap.get(dateStr);
                summary.totalUsage += usage.Usage || 0;
                summary.netUsage += usage.Usage || 0;
            });
            
            // If there are solar configurations, add generation data
            if (configs && configs.length > 0) {
                const configIds = configs.map(c => c.ID);
                const supplies = await SELECT.from(SolarSupplies)
                    .where({ Configuration_ID: { in: configIds } });
                    
                // Get energy rate
                let rate = 0;
                if (user.ContractType === 'fixed') {
                    const energyRate = await SELECT.one.from(EnergyRates)
                        .where({ User_ID: user.ID });
                    if (energyRate) {
                        rate = energyRate.Price;
                    }
                } else {
                    rate = 0.25; // Default rate for variable contracts
                }
                
                // Add supply data to summary
                supplies.forEach(supply => {
                    const dateStr = supply.Date.toISOString().split('T')[0];
                    
                    if (!summaryMap.has(dateStr)) {
                        summaryMap.set(dateStr, {
                            date: supply.Date,
                            totalUsage: 0,
                            totalSupply: 0,
                            netUsage: 0,
                            savings: 0
                        });
                    }
                    
                    const summary = summaryMap.get(dateStr);
                    const generated = supply.EnergyGenerated || 0;
                    summary.totalSupply += generated;
                    summary.netUsage -= generated;
                    summary.savings += parseFloat((generated * rate).toFixed(2));
                });
            }
            
            // Convert map to array and sort by date
            return Array.from(summaryMap.values())
                .sort((a, b) => b.date.getTime() - a.date.getTime());
                
        } catch (error) {
            console.error("Error in getUserUsageSummary:", error);
            return [];
        }
    });
});