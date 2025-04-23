using com.ss.energysystem as db from '../db/schema';

service AdminService @(path: '/admin', requires: 'Admin') {
    @readonly
    entity Users as projection on db.Users;
    
    @readonly
    entity SolarPanelConfigurations as projection on db.SolarPanelConfigurations {
        *,
        // Instead of including User_ID directly, just expand the User association
        // and project specific fields from it
        User.Email as UserEmail,
        User.Firstname as UserFirstname, 
        User.Lastname as UserLastname,
        User.ContractType as UserContractType
    };
    
    // Other entities remain unchanged
    @readonly
    entity EnergyUsages as projection on db.EnergyUsages;
    
    @readonly
    entity EnergyRates as projection on db.EnergyRates;
    
    @readonly
    entity Calculations as projection on db.Calculations;
    
    @readonly
    entity SolarSupplies as projection on db.SolarSupplies;
    
    // Functions
    function getAllConfigurations() returns array of SolarPanelConfigurations;
    function getConfigurationDetails(id: UUID) returns SolarPanelConfigurations;
}