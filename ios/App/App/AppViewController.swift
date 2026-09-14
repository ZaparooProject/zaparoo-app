import Capacitor

class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MfaAuthenticationPlugin())
        bridge?.registerPluginInstance(ShakeDetectorPlugin())
    }
}
