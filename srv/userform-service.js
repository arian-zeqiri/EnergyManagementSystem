const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function() {
    // We need to properly access the entities from the database namespace
    const db = await cds.connect.to('db');
    
    // Reference the entity definitions from our database model
    const { 
        Users,
        SolarPanelConfigurations, 
        EnergyRates 
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
    
    // Handle READ operations on UserProfile to filter by current user
    this.before('READ', 'UserProfile', async (req) => {
        const userEmail = _getUserEmail(req);
        
        if (userEmail) {
            req.query.where('Email =', userEmail);
        }
    });
    
    // Handle READ operations on SolarConfigurations to filter by current user
    this.before('READ', 'SolarConfigurations', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);
            
            if (user) {
                req.query.where('User_ID =', user.ID);
            }
        } catch (error) {
            console.error("Error in SolarConfigurations before handler:", error);
            // Continue with the request - don't block it
        }
    });
    
    // Handle READ operations on userEnergyRate to filter by current user
    this.before('READ', 'userEnergyRate', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            const user = await _getUserByEmail(userEmail);
            
            if (user) {
                req.query.where('User_ID =', user.ID);
            }
        } catch (error) {
            console.error("Error in userEnergyRate before handler:", error);
            // Continue with the request - don't block it
        }
    });
    
    // Function: Get current user profile
    this.on('getUserProfile', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) {
                return {
                    Email: '',
                    Firstname: '',
                    Lastname: '',
                    ContractType: 'variable' // Default value
                };
            }
            
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
    
    // Function: Get current user's energy rate
    this.on('getuserEnergyRate', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) return null;
            
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
    
    // Function: Get current user's solar configuration
    this.on('getUserSolarConfig', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) return null;
            
            const user = await _getUserByEmail(userEmail);
            
            if (!user) {
                return null; // No user found
            }
            
            const config = await SELECT.one.from(SolarPanelConfigurations)
                .where({ User_ID: user.ID });
                
            return config || null;
        } catch (error) {
            console.error("Error in getUserSolarConfig:", error);
            return null;
        }
    });
    
    // Action: Update user profile
    this.on('updateUserProfile', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) {
                throw new Error('User email not found. Authentication may be missing.');
            }
            
            const { firstName, lastName, contractType } = req.data;
            
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
                
                // Create result object
                resultObj = {
                    ID: existingUser.ID,
                    Email: userEmail,
                    Firstname: firstName,
                    Lastname: lastName,
                    ContractType: contractType
                };
            } else {
                // Insert new user
                const result = await INSERT.into(Users).entries({
                    Email: userEmail,
                    Firstname: firstName,
                    Lastname: lastName,
                    ContractType: contractType
                });
                
                // Try to get ID from the result or query
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
            }
            
            return resultObj;
        } catch (error) {
            console.error("Error in updateUserProfile:", error);
            req.error({
                code: 'UPDATE_USER_ERROR',
                message: error.message
            });
        }
    });
    
    // Action: Update user energy rate
    this.on('updateUserEnergyRate', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) {
                throw new Error('User email not found. Authentication may be missing.');
            }
            
            // Extract data from request
            const { Price } = req.data;
            
            // Get user
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
                // Update existing rate
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
            } else {
                // Create new rate
                await INSERT.into(EnergyRates).entries({
                    Date: date,
                    Time: time,
                    Price: Price,
                    User_ID: user.ID
                });
                
                // Get the newly created rate
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
            }
            
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
    this.on('updateSolarConfig', async (req) => {
        try {
            const userEmail = _getUserEmail(req);
            
            if (!userEmail) {
                throw new Error('User email not found. Authentication may be missing.');
            }
            
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
            
            // Get user
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
            }
            
            return resultObj;
        } catch (error) {
            console.error("Error in updateSolarConfig:", error);
            req.error({
                code: 'UPDATE_CONFIG_ERROR',
                message: error.message
            });
        }
    });
});