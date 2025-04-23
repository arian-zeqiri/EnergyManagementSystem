sap.ui.require(
    [
        'sap/fe/test/JourneyRunner',
        'adminpage/test/integration/FirstJourney',
		'adminpage/test/integration/pages/SolarPanelConfigurationsList',
		'adminpage/test/integration/pages/SolarPanelConfigurationsObjectPage'
    ],
    function(JourneyRunner, opaJourney, SolarPanelConfigurationsList, SolarPanelConfigurationsObjectPage) {
        'use strict';
        var JourneyRunner = new JourneyRunner({
            // start index.html in web folder
            launchUrl: sap.ui.require.toUrl('adminpage') + '/index.html'
        });

       
        JourneyRunner.run(
            {
                pages: { 
					onTheSolarPanelConfigurationsList: SolarPanelConfigurationsList,
					onTheSolarPanelConfigurationsObjectPage: SolarPanelConfigurationsObjectPage
                }
            },
            opaJourney.run
        );
    }
);