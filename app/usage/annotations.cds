using UsageService from '../../srv/usage-service';

annotate UsageService.CustomerUsage with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Energy Usage',
            TypeNamePlural: 'Energy Usages',
            Title: { Value: Date },
            Description: { Value: Time }
        },
        SelectionFields: [ Date ],
        LineItem: [
            { Value: Date },
            { Value: Time },
            { Value: Usage }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Usage Details',
                Target: '@UI.FieldGroup#Details'
            }
        ],
        FieldGroup#Details: {
            Data: [
                { Value: Date },
                { Value: Time },
                { Value: Usage },
                { Value: User.ContractType }
            ]
        }
    }
);

annotate UsageService.CustomerGeneration with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Energy Generation',
            TypeNamePlural: 'Energy Generations',
            Title: { Value: Date },
            Description: { Value: Time }
        },
        SelectionFields: [ Date ],
        LineItem: [
            { Value: Date },
            { Value: Time },
            { Value: EnergyGenerated },
            { Value: Savings }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Generation Details',
                Target: '@UI.FieldGroup#Details'
            }
        ],
        FieldGroup#Details: {
            Data: [
                { Value: Date },
                { Value: Time },
                { Value: EnergyGenerated },
                { Value: Savings },
                { Value: Configuration.PanelAmount },
                { Value: Configuration.ModulePower }
            ]
        }
    }
);