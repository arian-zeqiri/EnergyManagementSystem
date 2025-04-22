using com.ss.energysystem as db from '../db/schema';

service UserFormService @(path: '/userform') {
    @readonly
    entity CurrentUser {
        key email        : String;
            firstName    : String;
            lastName     : String;
            contractType : String;
    }

    @cds.redirection.target
    @odata.draft.enabled: false
    entity UserProfile         as
        projection on db.Users {
            *
        };

    @cds.redirection.target
    entity SolarConfigurations as
        projection on db.SolarPanelConfigurations {
            *, // This includes all fields
            User // This includes the association
        }

    // Actions for user profile management
    action   updateUserProfile(firstName : String,
                               lastName : String,
                               contractType : String) returns UserProfile;

    // Action to create or update solar configuration
    action   updateSolarConfig(panelAmount : Integer,
                               modulePower : Integer,
                               panelAngle : Integer,
                               panelAzimuth : Integer,
                               latitude : Decimal(9, 6),
                               longitude : Decimal(9, 6),
                               location : String)     returns SolarConfigurations;

    // Function to get current user's profile
    function getUserProfile()                         returns UserProfile;
    // Function to get current user's solar configuration
    function getUserSolarConfig()                     returns SolarConfigurations;
}
