using com.ss.energysystem as db from '../db/schema';

service UserFormService @(
    path: '/userform',
    requires: 'authenticated-user'
) {
    @readonly
    entity CurrentUser {
        key email        : String;
            firstName    : String;
            lastName     : String;
            contractType : String;
    }

    @cds.redirection.target
    @odata.draft.enabled: false
    entity UserProfile as projection on db.Users {
        *
    };

    @cds.redirection.target
    entity SolarConfigurations as projection on db.SolarPanelConfigurations {
        *,
        User
    };

    @cds.redirection.target
    entity userEnergyRate as projection on db.EnergyRates {
        *,
        User
    };

    // Actions for user profile management
    action updateUserProfile(
        firstName : String,
        lastName : String,
        contractType : String
    ) returns UserProfile;

    action updateUserEnergyRate(
        Price : Decimal(6, 4)
    ) returns userEnergyRate;

    // Action to create or update solar configuration
    action updateSolarConfig(
        panelAmount : Integer,
        modulePower : Integer,
        panelAngle : Integer,
        panelAzimuth : Integer,
        latitude : Decimal(9, 6),
        longitude : Decimal(9, 6),
        location : String
    ) returns SolarConfigurations;

    // Functions to get current user's data
    function getUserProfile() returns UserProfile;
    function getUserSolarConfig() returns SolarConfigurations;
    function getuserEnergyRate() returns userEnergyRate;
}