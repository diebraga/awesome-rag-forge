use std::io::{Read, Write};
use std::sync::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(pub Mutex<Option<PtySession>>);

#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    state: State<PtyState>,
    program: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    // A new session replaces any existing one -- only one PTY at a time.
    if let Some(mut existing) = state.0.lock().map_err(|e| e.to_string())?.take() {
        let _ = existing.child.kill();
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 32, cols: 100, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&program);
    cmd.args(&args);
    cmd.cwd(&cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    if app_handle.emit("pty-output", chunk).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("pty-exit", ());
    });

    *state.0.lock().map_err(|e| e.to_string())? = Some(PtySession { writer, master: pair.master, child });
    Ok(())
}

#[tauri::command]
pub fn write_pty(state: State<PtyState>, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_mut().ok_or("No active terminal session.")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(state: State<PtyState>, rows: u16, cols: u16) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_ref().ok_or("No active terminal session.")?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_pty(state: State<PtyState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = guard.take() {
        let _ = session.child.kill();
    }
    Ok(())
}
