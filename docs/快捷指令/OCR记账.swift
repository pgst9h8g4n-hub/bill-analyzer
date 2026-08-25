#!/usr/bin/env swift
// 小六记 - iOS 快捷指令 OCR 记账
//
// 使用方法：
// 1. 将本文件导入 iOS「快捷指令」App（通过分享菜单 → 保存到快捷指令）
// 2. 或者在 Xcode 中运行，先替换底部的 BASE_URL 为你部署的域名
// 3. 触发时会自动选取最新照片 → OCR 识别 → 打开 PWA 表单预填
//
// 注意：需要在快捷指令中授予相册访问权限

import Foundation
import Vision
import Photos
import UIKit

// ⚠️ 替换为你实际部署的域名
let BASE_URL = "https://bill-analyzer-lac.vercel.app"

// 请求相册权限
PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
    guard status == .authorized else {
        print("❌ 没有相册访问权限")
        exit(1)
    }

    // 取最近一张照片
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.limit = 1
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    guard let asset = assets.firstObject else {
        print("❌ 没有找到照片")
        exit(1)
    }

    // 下载图片
    let manager = PHCachingImageManager.default()
    let options2 = PHImageRequestOptions()
    options2.deliveryMode = .highQualityFormat
    options2.isNetworkAccessAllowed = true

    manager.requestImage(
        for: asset,
        targetSize: CGSize(width: 1024, height: 1024),
        contentMode: .default,
        options: options2
    ) { image, _ in
        guard let image = image, let data = image.jpegData(compressionQuality: 0.9) else {
            print("❌ 无法加载图片")
            exit(1)
        }

        // Vision OCR
        let request = VNRecognizeTextRequest { req, err in
            if let err = err {
                print("❌ OCR 失败: \(err)")
                exit(1)
            }

            guard let observations = req.results as? [VNRecognizedTextObservation] else {
                print("❌ 未识别到文字")
                exit(1)
            }

            let allText = observations.flatMap { $0.topCandidates(1).first?.string ?? "" }.joined(separator: "\n")
            print("📝 识别结果: \(allText)")

            // 解析金额
            var amount: String? = nil
            let patterns = [
                #"¥\s*([\d,]+\.?\d*)"#,
                #"\￥\s*([\d,]+\.?\d*)"#,
                #"([\d,]+\.?\d*)\s*元"#,
                #"\b([\d]+\.[\d]{2})\b"#
            ]
            for pattern in patterns {
                if let regex = try? NSRegularExpression(pattern: pattern),
                   let match = regex.firstMatch(
                     in: allText,
                     range: NSRange(allText.startIndex..., in: allText)
                   ) {
                    amount = String(allText[Range(match.range, in: allText)!])
                    break
                }
            }

            // 解析商户（取第一行非金额/纯数字的文字）
            var merchant: String? = nil
            for line in allText.split(separator: "\n") {
                let trimmed = String(line).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                // 如果包含中文且不是纯数字，认为是商户名
                if trimmed.contains(where: { !$0.isNumber && !$0.isASCII }) {
                    merchant = trimmed
                    break
                }
            }

            // 构建 URL
            var components = URLComponents(string: "\(BASE_URL)/ocr")
            var items: [URLQueryItem] = []
            if let a = amount { items.append(URLQueryItem(name: "amount", value: a)) }
            if let m = merchant { items.append(URLQueryItem(name: "merchant", value: m)) }
            components?.queryItems = items

            if let url = components?.url, UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
                print("✅ 已打开 PWA 表单")
            } else {
                print("❌ 无法打开应用，请检查 BASE_URL")
            }
        }
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en"]

        if let ciImage = CIImage(data: data) {
            let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
            try? handler.perform([request])
        }
    }
}
