import AVFoundation
import Capacitor
import UIKit

protocol LinkyScannerViewControllerDelegate: AnyObject {
    func linkyScannerViewControllerDidCancel(_ viewController: LinkyScannerViewController)
    func linkyScannerViewController(_ viewController: LinkyScannerViewController, didFailWith message: String)
    func linkyScannerViewController(_ viewController: LinkyScannerViewController, didScan value: String)
}

final class LinkyScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    weak var delegate: LinkyScannerViewControllerDelegate?

    private let captureSession = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "fit.linky.app.qrscanner")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var hasFinished = false

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black
        modalPresentationStyle = .fullScreen

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Close", for: .normal)
        cancelButton.tintColor = .white
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        cancelButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)

        let titleLabel = UILabel()
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Scan QR code"
        titleLabel.textColor = .white
        titleLabel.font = UIFont.systemFont(ofSize: 20, weight: .semibold)

        view.addSubview(cancelButton)
        view.addSubview(titleLabel)

        NSLayoutConstraint.activate([
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            cancelButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])

        configureCaptureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)

        sessionQueue.async { [weak self] in
            guard let self, !self.captureSession.isRunning else {
                return
            }

            self.captureSession.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)

        sessionQueue.async { [weak self] in
            guard let self, self.captureSession.isRunning else {
                return
            }

            self.captureSession.stopRunning()
        }
    }

    @objc private func handleCancel() {
        finishOnce {
            self.delegate?.linkyScannerViewControllerDidCancel(self)
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let value = metadataObjects
            .compactMap({ $0 as? AVMetadataMachineReadableCodeObject })
            .compactMap(\.stringValue)
            .map({ $0.trimmingCharacters(in: .whitespacesAndNewlines) })
            .first(where: { !$0.isEmpty }) else {
            return
        }

        finishOnce {
            self.delegate?.linkyScannerViewController(self, didScan: value)
        }
    }

    private func configureCaptureSession() {
        guard let device = AVCaptureDevice.default(for: .video) else {
            delegate?.linkyScannerViewController(self, didFailWith: "Camera unavailable")
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard captureSession.canAddInput(input) else {
                delegate?.linkyScannerViewController(self, didFailWith: "Camera input unavailable")
                return
            }

            captureSession.addInput(input)

            let metadataOutput = AVCaptureMetadataOutput()
            guard captureSession.canAddOutput(metadataOutput) else {
                delegate?.linkyScannerViewController(self, didFailWith: "Scanner output unavailable")
                return
            }

            captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]

            let previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
            previewLayer.videoGravity = .resizeAspectFill
            previewLayer.frame = view.layer.bounds
            view.layer.insertSublayer(previewLayer, at: 0)
            self.previewLayer = previewLayer
        } catch {
            delegate?.linkyScannerViewController(self, didFailWith: "Camera setup failed")
        }
    }

    private func finishOnce(action: @escaping () -> Void) {
        guard !hasFinished else {
            return
        }

        hasFinished = true
        sessionQueue.async { [weak self] in
            guard let self, self.captureSession.isRunning else {
                return
            }

            self.captureSession.stopRunning()
        }

        DispatchQueue.main.async {
            action()
        }
    }
}

@objc(LinkyScannerPlugin)
final class LinkyScannerPlugin: CAPPlugin, CAPBridgedPlugin, LinkyScannerViewControllerDelegate {
    let identifier = "LinkyScannerPlugin"
    let jsName = "LinkyScanner"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise)
    ]

    private var activeCall: CAPPluginCall?
    private weak var scannerViewController: LinkyScannerViewController?

    @objc func scan(_ call: CAPPluginCall) {
#if targetEnvironment(simulator)
        call.resolve([
            "cancelled": false,
            "message": "Camera scanning is unavailable in the iOS simulator"
        ])
        return
#else
        guard activeCall == nil else {
            call.reject("Scanner already active")
            return
        }

        let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)

        switch authorizationStatus {
        case .authorized:
            presentScanner(for: call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else {
                        call.reject("Scanner unavailable")
                        return
                    }

                    if granted {
                        self.presentScanner(for: call)
                    } else {
                        call.resolve([
                            "cancelled": false,
                            "message": "Camera permission denied"
                        ])
                    }
                }
            }
        case .denied, .restricted:
            call.resolve([
                "cancelled": false,
                "message": "Camera permission denied"
            ])
        @unknown default:
            call.resolve([
                "cancelled": false,
                "message": "Camera unavailable"
            ])
        }
#endif
    }

    private func presentScanner(for call: CAPPluginCall) {
        guard let bridgeViewController = bridge?.viewController else {
            call.reject("Bridge view controller unavailable")
            return
        }

        let scannerViewController = LinkyScannerViewController()
        scannerViewController.delegate = self

        activeCall = call
        self.scannerViewController = scannerViewController

        bridgeViewController.present(scannerViewController, animated: true)
    }

    func linkyScannerViewControllerDidCancel(_ viewController: LinkyScannerViewController) {
        resolveAndDismiss(viewController, payload: [
            "cancelled": true
        ])
    }

    func linkyScannerViewController(_ viewController: LinkyScannerViewController, didFailWith message: String) {
        resolveAndDismiss(viewController, payload: [
            "cancelled": false,
            "message": message
        ])
    }

    func linkyScannerViewController(_ viewController: LinkyScannerViewController, didScan value: String) {
        resolveAndDismiss(viewController, payload: [
            "cancelled": false,
            "value": value
        ])
    }

    private func resolveAndDismiss(_ viewController: UIViewController, payload: [String: Any]) {
        let finish = { [weak self] in
            guard let self else {
                return
            }

            self.activeCall?.resolve(payload)
            self.activeCall = nil
            self.scannerViewController = nil
        }

        if viewController.presentingViewController == nil {
            finish()
            return
        }

        viewController.dismiss(animated: true) {
            finish()
        }
    }
}