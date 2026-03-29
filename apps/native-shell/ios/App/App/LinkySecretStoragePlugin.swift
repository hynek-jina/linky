import Capacitor
import Foundation
import Security

@objc(LinkySecretStoragePlugin)
final class LinkySecretStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LinkySecretStoragePlugin"
    let jsName = "LinkySecretStorage"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private var serviceName: String {
        Bundle.main.bundleIdentifier ?? "fit.linky.app"
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = normalizedKey(from: call) else {
            call.reject("Missing key")
            return
        }

        let query = baseQuery(for: key).merging([
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: kCFBooleanTrue as Any
        ]) { _, newValue in
            newValue
        }

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        switch status {
        case errSecSuccess:
            guard let data = item as? Data,
                  let value = String(data: data, encoding: .utf8) else {
                call.reject("Stored value is unreadable")
                return
            }

            call.resolve(["value": value])
        case errSecItemNotFound:
            call.resolve([:])
        default:
            call.reject("Keychain read failed", nil, nil, ["status": status])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = normalizedKey(from: call) else {
            call.reject("Missing key")
            return
        }

        guard let value = call.getString("value")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty,
              let data = value.data(using: .utf8) else {
            call.reject("Missing value")
            return
        }

        let query = baseQuery(for: key)
        SecItemDelete(query as CFDictionary)

        let attributes = query.merging([
            kSecValueData as String: data
        ]) { _, newValue in
            newValue
        }

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            call.reject("Keychain write failed", nil, nil, ["status": status])
            return
        }

        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = normalizedKey(from: call) else {
            call.reject("Missing key")
            return
        }

        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Keychain delete failed", nil, nil, ["status": status])
            return
        }

        call.resolve()
    }

    private func normalizedKey(from call: CAPPluginCall) -> String? {
        guard let rawKey = call.getString("key")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !rawKey.isEmpty else {
            return nil
        }

        return rawKey
    }

    private func baseQuery(for key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
    }
}