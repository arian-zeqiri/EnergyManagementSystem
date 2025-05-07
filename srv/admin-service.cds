using com.ss.energysystem as db from '../db/schema';

service AdminService @(
    path    : '/admin',
    requires: 'Admin'
) {
    @readonly
    @cds.redirection.target // Mark this as the primary redirection target
    entity Users as projection on db.Users;

    entity SolarPanelConfigurations as projection on db.SolarPanelConfigurations {
        *,
        User.Email        as UserEmail,
        User.Firstname    as UserFirstname,
        User.Lastname     as UserLastname,
        User.ContractType as UserContractType,
        virtual null as TotalPower : Integer // Virtual field for calculated total power
    };

    // User profile entity for the current user
    entity UserProfile as projection on db.Users {
        *
    };

    @readonly
    entity EnergyUsages as projection on db.EnergyUsages {
        *,
        User : redirected to Users
    };

    @readonly
    entity EnergyRates as projection on db.EnergyRates {
        *,
        User : redirected to Users
    };

    @readonly
    entity Calculations as projection on db.Calculations {
        *,
        User : redirected to Users
    };

    @readonly
    entity SolarSupplies as projection on db.SolarSupplies;

    // Functions
    function getAllConfigurations() returns array of SolarPanelConfigurations;
    function getConfigurationDetails(id : UUID) returns SolarPanelConfigurations;
    
    // Actions for CRUD operations
    action createConfiguration(
        panelAmount : Integer,
        modulePower : Integer,
        orientation : String,
        userId      : UUID
    ) returns SolarPanelConfigurations;
    
    action updateConfiguration(
        id          : UUID,
        panelAmount : Integer,
        modulePower : Integer,
        orientation : String
    ) returns SolarPanelConfigurations;
    
    action deleteConfiguration(id : UUID) returns Boolean;
}