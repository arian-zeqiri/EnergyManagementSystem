using ForecastService as service from '../../srv/forecast-service';

annotate service.Forecasts with @(
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'Datum & Tijd',
            Value : DateTime,
            ![@UI.Importance] : #High,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Verwacht Vermogen (W)',
            Value : Watts,
            ![@UI.Importance] : #High,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Energieprijs (€/MWh)',
            Value : EnergyPrice,  // CHANGED: was Price, now EnergyPrice
            ![@UI.Importance] : #High,
        },
        {
            $Type : 'UI.DataFieldForAction',
            Action : 'ForecastService.refreshForecastData',
            Label : 'Ververs Mijn Data',
            ![@UI.Importance] : #High,
            InvocationGrouping : #ChangeSet,
        },
    ],
    
    UI.HeaderInfo : {
        TypeName : 'Energie Voorspelling',
        TypeNamePlural : 'Energie Voorspellingen',
        Title : {
            $Type : 'UI.DataField',
            Value : DateTime,
        }
    },
    
    UI.SelectionFields : [
        DateTime
    ],
    
    UI.PresentationVariant : {
        Text : 'Default',
        SortOrder : [{
            Property : DateTime,
            Descending : false
        }],
        Visualizations : ['@UI.LineItem']
    },
    
    UI.Chart : {
        Title : 'Solar Output vs Energy Prices',
        ChartType : #Line,
        Dimensions : [DateTime],
        DimensionAttributes : [{
            Dimension : DateTime,
            Role : #Category
        }],
        Measures : [Watts, EnergyPrice],
        MeasureAttributes : [
            {
                Measure : Watts,
                Role : #Axis1,
                DataPoint : '@UI.DataPoint#Watts'
            },
            {
                Measure : EnergyPrice,
                Role : #Axis2,
                DataPoint : '@UI.DataPoint#EnergyPrice'
            }
        ]
    },
    
    UI.DataPoint #Watts : {
        Value : Watts,
        Title : 'Solar Output (W)',
        TargetValue : 1000,
        Visualization : #Number
    },
    
    UI.DataPoint #EnergyPrice : {
        Value : EnergyPrice,
        Title : 'Energy Price (€/MWh)',
        Visualization : #Number
    },
    
    UI.FieldGroup #GeneralInfo : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Value : DateTime,
                Label : 'Tijdstip',
            },
            {
                $Type : 'UI.DataField',
                Value : Watts,
                Label : 'Verwacht Solar Vermogen (W)',
            },
            {
                $Type : 'UI.DataField',
                Value : EnergyPrice,
                Label : 'Energieprijs (€/MWh)',
            }
        ],
    },
    
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneralInfoFacet',
            Label : 'Voorspelling Details',
            Target : '@UI.FieldGroup#GeneralInfo',
        },
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Grafiek',
            Target : '@UI.Chart',
        },
    ]
);

// Aparte annotaties voor velden
annotate service.Forecasts with {
    @title : 'Datum & Tijd'
    @readonly
    DateTime;
    
    @title : 'Solar Vermogen (W)'
    @Measures.Unit : 'W'
    @readonly
    Watts;
    
    @title : 'Energieprijs (€/MWh)'
    @Measures.Unit : '€/MWh'
    @readonly
    EnergyPrice;  // CHANGED: was EnergyRates, now EnergyPrice
};