# Whisper Speech to Text

App HTML/JS thuần dùng Transformers.js để chạy Whisper trực tiếp trong trình duyệt.

## Chạy app

Mở thư mục này bằng một static server, ví dụ:

```powershell
python -m http.server 8080
```

Sau đó vào:

```text
http://localhost:8080
```

Lần đầu chạy, trình duyệt sẽ tải model từ Hugging Face Hub và cache lại. File audio được xử lý trong trình duyệt, không cần backend.

## Ghi chú

- Model nhỏ như `whisper-tiny` tải nhanh hơn, model lớn như `whisper-small` chính xác hơn nhưng nặng hơn.
- Nếu bật WebGPU, trình duyệt cần hỗ trợ WebGPU. Nếu lỗi, tắt tùy chọn này để chạy bằng WASM.
- Với tiếng Việt, nên dùng model đa ngôn ngữ và chọn `Tiếng Việt`.
