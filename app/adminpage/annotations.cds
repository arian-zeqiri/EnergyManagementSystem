using AdminService as service from '../../srv/admin-service';

annotate service.SolarPanelConfigurations with @(
    UI.HeaderInfo                : {
        TypeName      : 'Solar Panel Configuration',
        TypeNamePlural: 'Solar Panel Configurations',
        Title         : {
            $Type: 'UI.DataField',
            Value: UserFirstname,

        },
        Description   : {
            $Type: 'UI.DataField',
            Value: Location,
        }
    },

    // Add HeaderFacets to show key information at the top
    UI.HeaderFacets              : [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'UserInfoFacet',
        Label : 'User Details',
        Target: '@UI.FieldGroup#UserInfo'
    }],

    // User information field group
    UI.FieldGroup #UserInfo      : {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'ID',
                Value: User_ID
            },
            {
                $Type: 'UI.DataField',
                Label: 'Email',
                Value: UserEmail
            },
            {
                $Type: 'UI.DataField',
                Label: 'First Name',
                Value: UserFirstname
            },
            {
                $Type: 'UI.DataField',
                Label: 'Last Name',
                Value: UserLastname
            },
            {
                $Type: 'UI.DataField',
                Label: 'Contract Type',
                Value: UserContractType
            }
        ]
    },

    UI.FieldGroup #GeneratedGroup: {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'Location',
                Value: Location,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Panel Amount',
                Value: PanelAmount,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Panel Angle',
                Value: PanelAngle,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Panel Azimuth',
                Value: PanelAzimuth,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Longitude',
                Value: Longitude,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Latitude',
                Value: Latitude,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Module Power',
                Value: ModulePower,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Module Power (W)',
                Value: ModulePower,
            }
        ],
    },

    UI.Facets                    : [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'UserDetailsFacet',
            Label : 'User Details',
            Target: '@UI.FieldGroup#UserInfo',
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'ConfigDetailsFacet',
            Label : 'Configuration Details',
            Target: '@UI.FieldGroup#GeneratedGroup',
        }
    ],

    UI.LineItem                  : [
        {
            $Type: 'UI.DataField',
            Label: 'User Email',
            Value: UserEmail,
        },
        {
            $Type: 'UI.DataField',
            Label: 'Location',
            Value: Location,
        },
        {
            $Type: 'UI.DataField',
            Label: 'Panel Amount',
            Value: PanelAmount,
        },
        {
            $Type: 'UI.DataField',
            Label: 'Panel Angle',
            Value: PanelAngle,
        },
        {
            $Type: 'UI.DataField',
            Label: 'Module Power',
            Value: ModulePower,
        },
    ],
);

annotate service.SolarPanelConfigurations with {
    User @Common.ValueList: {
        $Type         : 'Common.ValueListType',
        CollectionPath: 'Users',
        Parameters    : [
            {
                $Type            : 'Common.ValueListParameterInOut',
                LocalDataProperty: User_ID,
                ValueListProperty: 'ID'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'Email'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'Firstname'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'Lastname'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'ContractType'
            },
        ],
    }
};
