use scrap::{Capturer, Display};
use image::codecs::jpeg::JpegEncoder;
use image::ExtendedColorType;
use std::time::Duration;

pub struct ScreenCapture {
    capturer: Capturer,
    width: usize,
    height: usize,
}

// SAFETY: ScreenCapture is only accessed from a single thread (the capture thread).
// The raw pointer inside Capturer is not shared across threads.
unsafe impl Send for ScreenCapture {}

impl ScreenCapture {
    pub fn new(display_index: usize) -> Result<Self, String> {
        let displays = Display::all()
            .map_err(|e| format!("Failed to enumerate displays: {}", e))?;

        let display_count = displays.len();
        let display = displays
            .into_iter()
            .nth(display_index)
            .ok_or_else(|| format!("Display {} not found ({} available)", display_index, display_count))?;

        let (w, h) = (display.width(), display.height());
        let capturer = Capturer::new(display)
            .map_err(|e| format!("Failed to create capturer: {}", e))?;

        Ok(Self {
            capturer,
            width: w,
            height: h,
        })
    }

    pub fn dimensions(&self) -> (usize, usize) {
        (self.width, self.height)
    }

    pub fn list_displays() -> Result<Vec<(usize, usize, usize)>, String> {
        let displays = Display::all()
            .map_err(|e| format!("Failed to enumerate displays: {}", e))?;

        Ok(displays
            .iter()
            .enumerate()
            .map(|(i, d)| (i, d.width(), d.height()))
            .collect())
    }

    pub fn capture_frame(&mut self, quality: u8) -> Result<Vec<u8>, String> {
        let frame_data: Vec<u8>;
        loop {
            match self.capturer.frame() {
                Ok(f) => {
                    frame_data = f.to_vec();
                    break;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(1));
                    continue;
                }
                Err(e) => return Err(format!("Capture error: {}", e)),
            }
        }

        self.encode_jpeg(&frame_data, quality)
    }

    fn encode_jpeg(&self, frame: &[u8], quality: u8) -> Result<Vec<u8>, String> {
        let stride = frame.len() / self.height;
        let mut rgb = Vec::with_capacity(self.width * self.height * 3);

        for y in 0..self.height {
            let row_start = y * stride;
            for x in 0..self.width {
                let offset = row_start + x * 4;
                if offset + 2 < frame.len() {
                    rgb.push(frame[offset + 2]); // R
                    rgb.push(frame[offset + 1]); // G
                    rgb.push(frame[offset]);     // B
                }
            }
        }

        let mut buf = Vec::with_capacity(self.width * self.height / 4);
        let mut encoder = JpegEncoder::new_with_quality(&mut buf, quality);
        encoder
            .encode(&rgb, self.width as u32, self.height as u32, ExtendedColorType::Rgb8)
            .map_err(|e| format!("JPEG encode error: {}", e))?;

        Ok(buf)
    }
}
