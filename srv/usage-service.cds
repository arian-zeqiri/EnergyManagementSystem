using com.ss.energysystem as db from '../db/schema';

service UsageService @(
    path: '/usage',
    requires: 'authenticated-user'
) {
    @readonly
    entity UserProfile as projection on db.Users {
        *
    };

    @readonly
    entity CustomerUsage as projection on db.EnergyUsages {
        *,
        User : redirected to UserProfile
    };
    
    @readonly
    entity CustomerGeneration as projection on db.SolarSupplies {
        *,
        Configuration,
        virtual null as Savings : Decimal(5, 2)
    };
    
    // Functions to retrieve usage data
    function getCurrentUserUsage() returns array of CustomerUsage;
    function getCurrentUserGeneration() returns array of CustomerGeneration;
    function getUserUsageSummary() returns array of {
        date         : Date;
        totalUsage   : Integer;
        totalSupply  : Integer;
        netUsage     : Integer;
        savings      : Decimal(5, 2);
    };
}