namespace com.ss.energysystem;

using {
    cuid,
    managed,
    sap.common.CodeList
} from '@sap/cds/common';

entity Users : cuid, managed {
    Email          : String(100) @assert.format: 'email';
    Firstname      : String(100);
    Lastname       : String(100);
    ContractType   : String enum {
        fixed;
        variable;
    };

    // Associations
    Configurations : Association to many SolarPanelConfigurations
                         on Configurations.User = $self;

    EnergyUsages   : Association to many EnergyUsages
                         on EnergyUsages.User = $self;
    EnergyRates    : Association to many EnergyRates
                         on EnergyRates.User = $self;
    Calculations   : Association to many Calculations
                         on Calculations.User = $self;
    WeatherForecasts : Association to many WeatherForecast
                         on WeatherForecasts.User = $self;
}

entity EnergyRates : cuid {
    DateTime : Timestamp;
    Price    : Decimal(8, 4);
    User     : Association to Users;
}

entity WeatherForecast : cuid {
    DateTime : Timestamp;
    Watts    : Integer;
    User     : Association to Users;
}

entity Calculations : cuid {
    DateTime         : Timestamp;
    PredictedUsage   : Integer;
    PredictedSavings : Decimal(5, 2);
    Conclusion       : Integer;
    User             : Association to Users;
}

entity SolarPanelConfigurations : cuid {
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
    Latitude     : Decimal(9, 6);
    Longitude    : Decimal(9, 6);
    User         : Association to Users;
    Supplies     : Association to many SolarSupplies
                       on Supplies.Configuration = $self;
}

entity EnergyUsages : cuid {
    Date  : Date;
    Time  : Time;
    Usage : Integer;
    User  : Association to Users;
}

entity SolarSupplies : cuid {
    Date            : Date;
    Time            : Time;
    EnergyGenerated : Integer;
    Configuration   : Association to SolarPanelConfigurations;
}
