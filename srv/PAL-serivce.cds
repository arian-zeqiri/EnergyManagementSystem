// srv/calculation-service.cds
using { com.ss.energysystem as db } from '../db/schema';

service CalculationService @(path: '/calculation') {
    
    // Read entities
    @readonly entity Calculations as projection on db.Calculations;
    @readonly entity EnergyUsages as projection on db.EnergyUsages;
    
    // Main action to generate calculations
    action generateCalculations(userId: UUID, days: Integer) returns {
        success: Boolean;
        message: String;
        calculationsGenerated: Integer;
    };
    
    // Action to train PAL model with historical data
    action trainPredictionModel(userId: UUID) returns {
        success: Boolean;
        message: String;
        accuracy: Decimal;
    };
    
    // Function to get optimization advice
    function getOptimizationAdvice(userId: UUID, dateTime: DateTime) returns {
        conclusion: Integer;
        reason: String;
        expectedSavings: Decimal;
        solarOutput: Integer;
        predictedUsage: Integer;
        energyPrice: Decimal;
    };
}