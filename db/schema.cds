namespace com.ss.energysystem;

using {
    cuid,
    managed,
    sap.common.CodeList
} from '@sap/cds/common';

entity Users : cuid, managed {
    key Email          : String(100) @assert.format: 'email';
        Firstname      : String(100);
        Lastname       : String(100);
        ContractType   : String enum {
            fixed;
            variable;
        };

        // Associations
        Configurations : Association to many SolarPanelConfigurations
                             on Configurations.ID = ID;

        EnergyUsages   : Association to many EnergyUsages
                             on EnergyUsages.User = $self;
        EnergyRates    : Association to many EnergyRates
                             on EnergyRates.User = $self;
        Calculations   : Association to many Calculations
                             on Calculations.User = $self;
}

entity EnergyRates {
    key ID    : Integer @cds.autoIncrement; // Use autoIncrement instead of generated
        Date  : Date;
        Time  : Time;
        Price : Decimal(5, 2);
        User  : Association to Users;
}

entity Calculations {
    key ID               : Integer @cds.autoIncrement; // Use autoIncrement instead of generated
        Date             : Date;
        Time             : Time;
        PredictedUsage   : Integer;
        PredictedSavings : Decimal(5, 2);
        Conclusion       : Integer;
        User             : Association to Users;
}

entity SolarPanelConfigurations {
    key ID           : UUID             @odata.Auto; // Change to UUID
        PanelAmount  : Integer not null @assert.range: [
            1,
            1000
        ];
        Location     : String(100);
        PanelAngle   : Integer          @assert.range: [
            0,
            90
        ];
        PanelAzimuth : Integer          @assert.range: [
            0,
            360
        ];
        ModulePower  : Integer not null; // Watts
        Latitude     : Decimal(9, 6); // Add this field
        Longitude    : Decimal(9, 6); // Add this field
        // This explicitly defines the relationship and the foreign key
        User         : Association to Users;

        Supplies     : Association to many SolarSupplies
                           on Supplies.ID = ID;
}

entity EnergyUsages {
    key ID    : Integer @cds.autoIncrement; // Use autoIncrement instead of generated
        Date  : Date;
        Time  : Time;
        Usage : Integer;
        User  : Association to Users;
}

entity SolarSupplies {
    key ID              : Integer @cds.autoIncrement; // Use autoIncrement instead of generated
        Date            : Date;
        Time            : Time;
        EnergyGenerated : Integer;
        Configuration   : Association to SolarPanelConfigurations;
}
