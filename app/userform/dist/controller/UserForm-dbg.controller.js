sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, MessageBox, MessageToast, BusyIndicator) {
    "use strict";

    return Controller.extend("userform.controller.UserForm", {
        onInit: function () {
            this._initAddressCache();
            this._initModels();
            this._loadUserData();
        },

        _initModels: function () {
            // User profile model
            const oUserModel = new JSONModel({
                Email: "",
                Firstname: "",
                Lastname: "",
                ContractType: "variable", // Default value
                EnergyRate: null
            });
            this.getView().setModel(oUserModel, "userProfile");
            
            // Energy rate model
            const oEnergyRateModel = new JSONModel({
                ID: null,
                Date: null,
                Time: null,
                Price: 0.00
            });
            this.getView().setModel(oEnergyRateModel, "energyRate");
            
            // Initialize UI based on default contract type
            // We'll call this again after data is loaded
            const view = this.getView();
            view.attachEventOnce("afterRendering", this._updateContractTypeUI, this);

            // Solar config model
            const oConfigModel = new JSONModel({
                PanelsAmount: 0,
                ModulesPower: 0,
                PanelAngle: 30, // Default value
                PanelAzimuth: 180, // Default value (south-facing)
                ID: null // Will be filled if existing config is found
            });
            this.getView().setModel(oConfigModel);

            // Address model
            this.getView().setModel(new JSONModel({
                suggestions: [],
                selectedAddress: {
                    latitude: "",
                    longitude: "",
                    displayName: ""
                }
            }), "address");

            // View state model (for UI state)
            this.getView().setModel(new JSONModel({
                formMode: "create", // 'create' or 'update'
                isBusy: false,
                hasValidationErrors: false,
                dataLoaded: false
            }), "viewState");
        },

        _loadUserData: function () {
            BusyIndicator.show();
            const viewState = this.getView().getModel("viewState");
            viewState.setProperty("/isBusy", true);

            // Load user profile data and then other data
            this._fetchUserProfile()
                .then(() => this._fetchEnergyRate())
                .then(() => this._fetchSolarConfig())
                .then(() => {
                    viewState.setProperty("/dataLoaded", true);
                    viewState.setProperty("/isBusy", false);
                    
                    // Update the UI based on loaded contract type
                    this._updateContractTypeUI();
                    
                    BusyIndicator.hide();
                })
                .catch(error => {
                    console.error("Error loading user data:", error);
                    MessageBox.error("Kon gebruikersgegevens niet laden: " + error.message);
                    viewState.setProperty("/isBusy", false);
                    BusyIndicator.hide();
                });
        },

        _fetchUserProfile: function () {
            return new Promise((resolve, reject) => {
                // Call the getUserProfile function
                $.ajax({
                    url: "/userform/getUserProfile()",
                    type: "GET",
                    success: (data) => {
                        if (data) {
                            // Update user model with retrieved data
                            const oUserModel = this.getView().getModel("userProfile");
                            oUserModel.setData(data);

                            const viewState = this.getView().getModel("viewState");
                            // If user exists, set mode to update
                            if (data.ID) {
                                viewState.setProperty("/formMode", "update");
                            }
                        }
                        resolve();
                    },
                    error: (error) => reject(error)
                });
            });
        },

        _fetchEnergyRate: function () {
            return new Promise((resolve, reject) => {
                // Only fetch energy rate if contract type is "fixed"
                const contractType = this.getView().getModel("userProfile").getProperty("/ContractType");
                
                if (contractType !== "fixed") {
                    resolve();
                    return;
                }
                
                // Call the getuserEnergyRate function - note the lowercase 'u' in 'user'
                $.ajax({
                    url: "/userform/getuserEnergyRate()",
                    type: "GET",
                    success: (data) => {
                        if (data) {
                            // Update energy rate model with retrieved data
                            const oEnergyRateModel = this.getView().getModel("energyRate");
                            oEnergyRateModel.setData(data);
                            
                            // Also update the energy price input field
                            const oEnergyPriceInput = this.byId("energyPriceInput");
                            if (oEnergyPriceInput) {
                                oEnergyPriceInput.setValue(data.Price);
                            }
                        }
                        resolve();
                    },
                    error: (error) => {
                        console.warn("Error fetching energy rate, but continuing:", error);
                        resolve(); // Resolve anyway to continue the chain
                    }
                });
            });
        },

        _fetchSolarConfig: function () {
            return new Promise((resolve, reject) => {
                // Call the getUserSolarConfig function
                $.ajax({
                    url: "/userform/getUserSolarConfig()",
                    type: "GET",
                    success: (data) => {
                        if (data) {
                            // Update config model with retrieved data
                            const oConfigModel = this.getView().getModel();
                            const oAddressModel = this.getView().getModel("address");

                            // Map backend fields to form fields
                            oConfigModel.setData({
                                PanelsAmount: data.PanelAmount,
                                ModulesPower: data.ModulePower,
                                PanelAngle: data.PanelAngle,
                                PanelAzimuth: data.PanelAzimuth,
                                ID: data.ID
                            });

                            // Set address data
                            oAddressModel.setProperty("/selectedAddress", {
                                latitude: data.Latitude,
                                longitude: data.Longitude,
                                displayName: data.Location
                            });

                            // Set form mode to update
                            const viewState = this.getView().getModel("viewState");
                            viewState.setProperty("/formMode", "update");
                        }
                        resolve();
                    },
                    error: (error) => reject(error)
                });
            });
        },

        _initAddressCache: function () {
            this._addressCache = this._addressCache || new Map();
        },

        onSuggestAddress: async function (oEvent) {
            const sValue = (oEvent.getParameter("suggestValue") || "").trim();
            const oAddressModel = this.getView().getModel("address");

            if (sValue.length < 2) {
                oAddressModel.setProperty("/suggestions", []);
                return;
            }

            if (this._addressCache.has(sValue)) {
                oAddressModel.setProperty("/suggestions", this._addressCache.get(sValue));
                return;
            }

            if (this._suggestionAbortController) {
                this._suggestionAbortController.abort();
            }
            this._suggestionAbortController = new AbortController();

            try {
                const sQuery = encodeURIComponent(sValue);
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${sQuery}&format=json&addressdetails=1&countrycodes=be&limit=5`,
                    {
                        headers: { "User-Agent": "EnergyManagementSystem/1.0" },
                        signal: this._suggestionAbortController.signal
                    }
                );

                if (!response.ok) throw new Error("Network error");

                const aData = await response.json();
                const aSuggestions = aData.map(item => ({
                    description: this._formatAddress(item),
                    lat: item.lat,
                    lon: item.lon,
                    displayName: item.display_name || this._formatAddress(item)
                }));

                this._addressCache.set(sValue, aSuggestions);
                oAddressModel.setProperty("/suggestions", aSuggestions);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error("Address suggestion error:", error);
                    MessageToast.show("Adres suggesties konden niet worden opgehaald");
                }
            }
        },

        _formatAddress: function (oItem) {
            const oAddr = oItem.address || {};
            const aParts = [
                [oAddr.road, oAddr.house_number].filter(Boolean).join(" "),
                oAddr.postcode,
                oAddr.city
            ].filter(Boolean);

            return aParts.length > 0 ? aParts.join(", ") : oItem.display_name;
        },

        onAddressSelected: function (oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) return;

            const oContext = oSelectedItem.getBindingContext("address");
            if (!oContext) return;

            const oSelected = oContext.getObject();
            const oAddressModel = this.getView().getModel("address");

            // Parse the coordinates as floats and round to 6 decimal places
            const roundedLat = parseFloat(parseFloat(oSelected.lat).toFixed(6));
            const roundedLon = parseFloat(parseFloat(oSelected.lon).toFixed(6));

            oAddressModel.setProperty("/selectedAddress", {
                latitude: roundedLat,
                longitude: roundedLon,
                displayName: oSelected.description || oSelected.displayName
            });
        },

        onSavePress: function () {
            if (!this._validateForm()) {
                MessageToast.show("Vul alle verplichte velden in");
                return;
            }

            BusyIndicator.show();

            // First update user profile
            this._updateUserProfile()
                .then(() => {
                    // Check if we need to update energy rate (fixed contract)
                    const userProfile = this.getView().getModel("userProfile").getData();
                    
                    if (userProfile.ContractType === "fixed") {
                        // Get the energy price from the input field
                        const energyPrice = parseFloat(this.byId("energyPriceInput").getValue());
                        
                        if (isNaN(energyPrice) || energyPrice <= 0 || energyPrice > 1) {
                            MessageToast.show("Voer een geldige energieprijs in (tussen 0 en 1)");
                            BusyIndicator.hide();
                            return Promise.reject(new Error("Invalid energy price"));
                        }
                        
                        // Add a slight delay before updating energy rate
                        return new Promise(resolve => {
                            setTimeout(() => {
                                this._updateEnergyRate(energyPrice)
                                    .then(data => {
                                        console.log("Energy rate updated:", data);
                                        resolve();
                                    })
                                    .catch(error => {
                                        console.error("Error updating energy rate:", error);
                                        MessageBox.error("Fout bij opslaan energieprijs: " + error.message);
                                        resolve(); // Still resolve to continue with solar config
                                    });
                            }, 100);
                        });
                    }
                    
                    return Promise.resolve();
                })
                .then(() => {
                    // Return early if we don't need to update solar config
                    if (!this._validateSolarConfigData()) {
                        MessageToast.show("Gebruikersprofiel succesvol opgeslagen");
                        BusyIndicator.hide();
                        return Promise.resolve();
                    }

                    // Continue with solar config update with a slight delay
                    // This helps prevent transaction conflicts
                    return new Promise(resolve => {
                        setTimeout(() => {
                            this._updateSolarConfig()
                                .then(data => {
                                    resolve(data);
                                })
                                .catch(error => {
                                    console.error("Error in solar config update:", error);
                                    MessageBox.error("Fout bij opslaan configuratie: " + error.message);
                                    resolve(null); // Still resolve to complete the chain
                                });
                        }, 100);
                    });
                })
                .then(result => {
                    if (result) {
                        MessageToast.show("Configuratie succesvol opgeslagen");
                    } else {
                        MessageToast.show("Gegevens succesvol opgeslagen");
                    }
                    BusyIndicator.hide();
                })
                .catch(error => {
                    console.error("Error saving data:", error);
                    MessageBox.error("Fout bij opslaan: " + error.message);
                    BusyIndicator.hide();
                });
        },

        // Helper method to validate solar config data
        _validateSolarConfigData: function () {
            const configData = this.getView().getModel().getData();
            const addressData = this.getView().getModel("address").getData().selectedAddress;

            // Check if we have enough data to save
            return configData.PanelsAmount > 0 &&
                configData.ModulesPower > 0 &&
                addressData.latitude &&
                addressData.longitude &&
                addressData.displayName;
        },

        _updateUserProfile: function () {
            return new Promise((resolve, reject) => {
                const userProfile = this.getView().getModel("userProfile").getData();

                // Prepare data for action call
                const payload = {
                    firstName: userProfile.Firstname,
                    lastName: userProfile.Lastname,
                    contractType: userProfile.ContractType
                };

                console.log("Updating user profile with data:", payload);

                // First get CSRF token
                $.ajax({
                    url: "/userform",
                    type: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: (data, textStatus, jqXHR) => {
                        const csrfToken = jqXHR.getResponseHeader("X-CSRF-Token");

                        // Now call the action
                        $.ajax({
                            url: "/userform/updateUserProfile",
                            type: "POST",
                            contentType: "application/json",
                            headers: {
                                "X-CSRF-Token": csrfToken
                            },
                            data: JSON.stringify(payload),
                            success: (data) => {
                                // Update model with returned data
                                if (data) {
                                    this.getView().getModel("userProfile").setData(data);
                                }

                                // Set form mode to update
                                const viewState = this.getView().getModel("viewState");
                                viewState.setProperty("/formMode", "update");

                                resolve(data);
                            },
                            error: (xhr) => {
                                console.error("Error updating user profile:", xhr.responseText);
                                reject(new Error(this._getErrorMessage(xhr)));
                            }
                        });
                    },
                    error: (xhr) => {
                        console.error("Failed to fetch CSRF token:", xhr.responseText);
                        reject(new Error("Kon beveiligingstoken niet ophalen"));
                    }
                });
            });
        },

        _updateEnergyRate: function (price) {
    return new Promise((resolve, reject) => {
        // Prijs afronden voor consistentie
        const roundedPrice = parseFloat(parseFloat(price).toFixed(4));
        
        // Alleen Price meesturen
        const payload = {
            Price: roundedPrice
        };
        
        console.log("Updating energy rate with price:", roundedPrice);

                // Get CSRF token
                $.ajax({
                    url: "/userform",
                    type: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: (data, textStatus, jqXHR) => {
                        const csrfToken = jqXHR.getResponseHeader("X-CSRF-Token");

                        // Call the updateUserEnergyRate action
                        $.ajax({
                            url: "/userform/updateUserEnergyRate",
                            type: "POST",
                            contentType: "application/json",
                            headers: {
                                "X-CSRF-Token": csrfToken
                            },
                            data: JSON.stringify(payload),
                            success: (data) => {
                                if (data) {
                                    // Update the energy rate model
                                    this.getView().getModel("energyRate").setData(data);
                                }
                                resolve(data);
                            },
                            error: (xhr) => {
                                console.error("Error updating energy rate:", xhr.responseText);
                                reject(new Error(this._getErrorMessage(xhr)));
                            }
                        });
                    },
                    error: (xhr) => {
                        console.error("Failed to fetch CSRF token for energy rate:", xhr.responseText);
                        reject(new Error("Kon beveiligingstoken niet ophalen"));
                    }
                });
            });
        },

        _updateSolarConfig: function () {
            return new Promise((resolve, reject) => {
                const configData = this.getView().getModel().getData();
                const addressData = this.getView().getModel("address").getData().selectedAddress;

                if (!addressData.latitude || !addressData.longitude || !addressData.displayName) {
                    console.error("Missing address data:", addressData);
                    reject(new Error("Adresgegevens ontbreken"));
                    return;
                }

                // Prepare data for action call
                const payload = {
                    panelAmount: configData.PanelsAmount,
                    modulePower: configData.ModulesPower,
                    panelAngle: configData.PanelAngle,
                    panelAzimuth: configData.PanelAzimuth,
                    latitude: addressData.latitude,
                    longitude: addressData.longitude,
                    location: addressData.displayName
                };

                console.log("Sending solar config payload:", payload);

                // Get CSRF token using a new request
                $.ajax({
                    url: "/userform",
                    type: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: (data, textStatus, jqXHR) => {
                        const csrfToken = jqXHR.getResponseHeader("X-CSRF-Token");

                        // Call the action with a fresh request
                        $.ajax({
                            url: "/userform/updateSolarConfig",
                            type: "POST",
                            contentType: "application/json",
                            headers: {
                                "X-CSRF-Token": csrfToken
                            },
                            data: JSON.stringify(payload),
                            success: (data) => {
                                if (!data) {
                                    console.warn("No data returned from updateSolarConfig");
                                    resolve({});
                                    return;
                                }

                                // Update models with returned data
                                this.getView().getModel().setData({
                                    PanelsAmount: data.PanelAmount,
                                    ModulesPower: data.ModulePower,
                                    PanelAngle: data.PanelAngle,
                                    PanelAzimuth: data.PanelAzimuth,
                                    ID: data.ID
                                });

                                // Set form mode to update
                                const viewState = this.getView().getModel("viewState");
                                viewState.setProperty("/formMode", "update");

                                resolve(data);
                            },
                            error: (xhr) => {
                                console.error("Error updating solar config:", xhr.responseText);
                                reject(new Error(this._getErrorMessage(xhr)));
                            }
                        });
                    },
                    error: (xhr) => {
                        console.error("Failed to fetch CSRF token for solar config:", xhr.responseText);
                        reject(new Error("Kon beveiligingstoken niet ophalen"));
                    }
                });
            });
        },

        _updateContractTypeUI: function() {
            const sContractType = this.getView().getModel("userProfile").getProperty("/ContractType");
            
            // Update UI based on contract type
            if (sContractType === "fixed") {
                // If fixed is selected, show the energy price field
                this.byId("energyPriceLabel").setVisible(true);
                this.byId("energyPriceInput").setVisible(true);
                
                // Also fetch the energy rate if not already loaded
                const oEnergyRateModel = this.getView().getModel("energyRate");
                if (!oEnergyRateModel.getProperty("/ID")) {
                    this._fetchEnergyRate();
                }
            } else {
                // If variable is selected, hide the energy price field
                this.byId("energyPriceLabel").setVisible(false);
                this.byId("energyPriceInput").setVisible(false);
            }
            
            // Also update the RadioButtonGroup if needed
            const oRadioButtonGroup = this.byId("contractTypeGroup");
            if (oRadioButtonGroup) {
                // For RadioButtonGroup, we need to set the selectedIndex instead of selectedKey
                const selectedIndex = sContractType === "fixed" ? 0 : 1;
                oRadioButtonGroup.setSelectedIndex(selectedIndex);
            }
            
            console.log("Contract type UI updated based on:", sContractType);
        },

        onContractTypeChange: function (oEvent) {
            // Get the selected contract type from the radio button group
            const sSelectedKey = oEvent.getParameter("selectedIndex") === 0 ? "fixed" : "variable";

            // Update the model with the new contract type
            this.getView().getModel("userProfile").setProperty("/ContractType", sSelectedKey);

            // Log the change for debugging
            console.log("Contract type changed to:", sSelectedKey);

            // Update UI based on contract type using the helper method
            this._updateContractTypeUI();
        },

        _getErrorMessage: function (xhr) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response && response.error && response.error.message) {
                    return response.error.message;
                }
            } catch (e) {
                // Ignore parsing errors
            }
            return xhr.statusText || "Onbekende fout";
        },

        _validateForm: function () {
            let isValid = true;

            // Helper function to safely set value state
            const setInputState = (sId, sState, sStateText) => {
                const oInput = this.byId(sId);
                if (oInput) {
                    oInput.setValueState(sState);
                    if (sStateText) oInput.setValueStateText(sStateText);
                }
            };

            // Validate user profile
            const userProfile = this.getView().getModel("userProfile").getData();

            if (!userProfile.Firstname || userProfile.Firstname.trim() === "") {
                setInputState("firstNameInput", "Error", "Voornaam is verplicht");
                isValid = false;
            } else {
                setInputState("firstNameInput", "None");
            }

            if (!userProfile.Lastname || userProfile.Lastname.trim() === "") {
                setInputState("lastNameInput", "Error", "Achternaam is verplicht");
                isValid = false;
            } else {
                setInputState("lastNameInput", "None");
            }

            // Validate fixed price if contract type is fixed
            if (userProfile.ContractType === "fixed") {
                const fixedPrice = this.byId("energyPriceInput").getValue();
                const priceValue = parseFloat(fixedPrice);
                if (!fixedPrice || isNaN(priceValue) || priceValue <= 0 || priceValue > 1) {
                    setInputState("energyPriceInput", "Error", "Voer een geldige prijs in (tussen 0 en 1)");
                    isValid = false;
                } else {
                    setInputState("energyPriceInput", "None");
                }
            }

            // Validate solar configuration
            const configData = this.getView().getModel().getData();

            if (!configData.PanelsAmount || configData.PanelsAmount <= 0) {
                setInputState("panelsAmountInput", "Error", "Voer een geldig aantal panelen in");
                isValid = false;
            } else {
                setInputState("panelsAmountInput", "None");
            }

            if (!configData.ModulesPower || configData.ModulesPower <= 0) {
                setInputState("modulePowerInput", "Error", "Voer een geldig vermogen in");
                isValid = false;
            } else {
                setInputState("modulePowerInput", "None");
            }

            // Validate address
            const addressData = this.getView().getModel("address").getData().selectedAddress;

            if (!addressData.displayName || addressData.displayName.trim() === "") {
                setInputState("addressInput", "Error", "Selecteer een adres");
                isValid = false;
            } else {
                setInputState("addressInput", "None");
            }

            return isValid;
        }
    });
});