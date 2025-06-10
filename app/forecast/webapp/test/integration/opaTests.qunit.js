sap.ui.require(
    [
        'sap/fe/test/JourneyRunner',
        'forecast/test/integration/FirstJourney',
		'forecast/test/integration/pages/ForecastsList',
		'forecast/test/integration/pages/ForecastsObjectPage'
    ],
    function(JourneyRunner, opaJourney, ForecastsList, ForecastsObjectPage) {
        'use strict';
        var JourneyRunner = new JourneyRunner({
            // start index.html in web folder
            launchUrl: sap.ui.require.toUrl('forecast') + '/index.html'
        });

       
        JourneyRunner.run(
            {
                pages: { 
					onTheForecastsList: ForecastsList,
					onTheForecastsObjectPage: ForecastsObjectPage
                }
            },
            opaJourney.run
        );
    }
);