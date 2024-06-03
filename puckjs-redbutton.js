var kb = require("ble_hid_keyboard");

NRF.setAdvertising({}, {
    name: 'RedButton',
    interval: 2000
});
NRF.setServices(undefined, { hid: kb.report });

NRF.nfcURL("https://vs.hn/boothraffle");

function btnPressed() {
    console.log("Button pressed! Battery level: " + E.getBattery());
    digitalWrite(LED1, 1);

    setTimeout(function () {
        digitalWrite(LED1, 0);
    }, 500);

    // Send the keyboard keys CTRL+ALT+G
    kb.tap(kb.KEY.G, kb.MODIFY.CTRL | kb.MODIFY.ALT, function () { });
}

setWatch(btnPressed, BTN, { edge: "rising", repeat: true, debounce: 50 });
