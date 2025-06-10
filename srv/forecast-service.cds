using {com.ss.energysystem as db} from '../db/schema';

service ForecastService {
    entity Forecasts as projection on db.WeatherForecast {
        *,
        User,
        virtual null as EnergyPrice : Decimal(8,4)
    } excluding { 
        createdAt, 
        createdBy, 
        modifiedAt, 
        modifiedBy 
    };

    entity EnergyRates as projection on db.EnergyRates {
        *,
        User
    };
    
    entity Users as projection on db.Users;

    action refreshForecastData(userId: UUID) returns String;
}