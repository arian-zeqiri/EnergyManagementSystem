sap.ui.require(
    [
        'sap/fe/test/JourneyRunner',
        'usage/usage/test/integration/FirstJourney',
		'usage/usage/test/integration/pages/CustomerUsageList',
		'usage/usage/test/integration/pages/CustomerUsageObjectPage'
    ],
    function(JourneyRunner, opaJourney, CustomerUsageList, CustomerUsageObjectPage) {
        'use strict';
        var JourneyRunner = new JourneyRunner({
            // start index.html in web folder
            launchUrl: sap.ui.require.toUrl('usage/usage') + '/index.html'
        });

       
        JourneyRunner.run(
            {
                pages: { 
					onTheCustomerUsageList: CustomerUsageList,
					onTheCustomerUsageObjectPage: CustomerUsageObjectPage
                }
            },
            opaJourney.run
        );
    }
);