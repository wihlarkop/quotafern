//! Credential-free standalone process fixture, compiled only by Rust regressions.
use std::io::{self, BufRead, Write};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--version") {
        println!("codex-cli 0.164.0");
        return;
    }
    if args
        .iter()
        .any(|arg| arg == "--fixture-stall" || arg == "--fixture-leaf")
    {
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }
    if args.iter().any(|arg| arg == "--fixture-tree") {
        let child = Command::new(std::env::current_exe().unwrap())
            .arg("--fixture-leaf")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        println!("{}", child.id());
        io::stdout().flush().unwrap();
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }
    // Deliberately synthetic JSONL, accepting only this monitor's read methods.
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        if line.contains("\"initialized\"") {
            continue;
        }
        let id = line
            .split("\"id\":")
            .nth(1)
            .unwrap()
            .split([',', '}'])
            .next()
            .unwrap()
            .trim();
        let result = if line.contains("\"initialize\"") {
            "{}"
        } else if line.contains("account/rateLimits/read") {
            r#"{"rateLimits":{"primary":{"usedPercent":25},"credits":{"hasCredits":true,"unlimited":false,"balance":"4"}}}"#
        } else if line.contains("account/usage/read") {
            r#"{"summary":{"lifetimeTokens":5},"dailyTokenUsage":[]}"#
        } else if line.contains("account/read") {
            r#"{"account":{"type":"chatgpt","email":"fixture@example.test"}}"#
        } else {
            panic!("unexpected fixture method");
        };
        println!("{{\"id\":{id},\"result\":{result}}}");
        io::stdout().flush().unwrap();
    }
}
