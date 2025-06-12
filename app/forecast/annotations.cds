using ForecastService as service from '../../srv/forecast-service';

// Voeg deze annotatie toe om timezone conversie uit te schakelen
annotate service.Forecasts:DateTime with @(
    odata.type: 'Edm.String',
    Common.Label: 'Datum & Tijd (UTC)',
    UI.DisplayFormat: 'NonComputedDate'
);

// Of probeer deze annotatie voor de hele service
annotate ForecastService with @(
    sap.timezone: 'UTC'
);

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
            Value : EnergyPrice,
            ![@UI.Importance] : #High,
        },
        {
            $Type : 'UI.DataFieldForAction',
            Action : 'ForecastService.refreshForecastData',
            Label : 'Ververs Mijn Data',
            ![@UI.Importance] : #High,
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

// Separate field annotations with proper CDS syntax
annotate service.Forecasts with {
    @title : 'Datum & Tijd'
    @readonly
    @Common.FieldControl : #ReadOnly
    @Common.Label : 'Datum & Tijd'
    @UI.HiddenFilter : false
    DateTime;

    @title : 'Solar Vermogen (W)'
    @Measures.Unit : 'W'
    @readonly
    @Common.FieldControl : #ReadOnly
    @Common.Label : 'Solar Vermogen'
    Watts;

    @title : 'Energieprijs (€/MWh)'
    @Measures.Unit : '€/MWh'
    @readonly
    @Common.FieldControl : #ReadOnly
    @Common.Label : 'Energieprijs'
    EnergyPrice;
};

// Additional timezone-specific annotations for DateTime field
annotate service.Forecasts.DateTime with @(
    Common.ValueFormat : {
        $Type : 'Common.ValueFormatType',
        ScaleFactor : 1,
        NumberOfFractionalDigits : 0
    },
    UI.IsImageURL : false
);