use serde::Serialize;
use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows::Win32::System::Threading::GetCurrentProcess;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStats {
    /// Physical memory currently held by the app — the number Task Manager shows.
    pub working_set_bytes: u64,
    /// Committed private memory (pagefile usage), i.e. what the app allocated.
    pub private_bytes: u64,
    pub peak_working_set_bytes: u64,
}

fn read_memory_counters() -> Result<ProcessStats, String> {
    let mut counters = PROCESS_MEMORY_COUNTERS::default();
    counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;

    unsafe {
        GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb)
            .map_err(|e| format!("Read process memory failed: {}", e))?;
    }

    Ok(ProcessStats {
        working_set_bytes: counters.WorkingSetSize as u64,
        private_bytes: counters.PagefileUsage as u64,
        peak_working_set_bytes: counters.PeakWorkingSetSize as u64,
    })
}

#[tauri::command]
pub async fn get_process_stats() -> Result<ProcessStats, String> {
    read_memory_counters()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_plausible_memory_numbers() {
        let stats = read_memory_counters().expect("memory counters");
        assert!(stats.working_set_bytes > 0);
        assert!(stats.peak_working_set_bytes >= stats.working_set_bytes);
    }
}
