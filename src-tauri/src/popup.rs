//! Physical-pixel placement for the single popup window.

use std::sync::Mutex;
use tauri::{
    LogicalUnit, Monitor, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow,
    WindowSizeConstraints,
};

const NORMAL_MIN_WIDTH: f64 = 320.0;
const NORMAL_MIN_HEIGHT: f64 = 480.0;
const NORMAL_MAX_WIDTH: f64 = 420.0;
static APPLIED_MINIMUMS: Mutex<Option<(u64, u64)>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TrayAnchor {
    x: f64,
    y: f64,
    width: u32,
    height: u32,
}

impl TrayAnchor {
    pub(crate) fn new(position: PhysicalPosition<f64>, size: PhysicalSize<u32>) -> Option<Self> {
        if !position.x.is_finite() || !position.y.is_finite() || size.width == 0 || size.height == 0
        {
            return None;
        }

        Some(Self {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        })
    }

    pub(crate) fn from_rect(rect: tauri::Rect) -> Option<Self> {
        let position = match rect.position {
            Position::Physical(position) => position,
            Position::Logical(_) => return None,
        };
        let size = match rect.size {
            Size::Physical(size) => size,
            Size::Logical(_) => return None,
        };

        Self::new(
            PhysicalPosition::new(f64::from(position.x), f64::from(position.y)),
            size,
        )
    }

    fn center(self) -> (f64, f64) {
        (
            self.x + f64::from(self.width) / 2.0,
            self.y + f64::from(self.height) / 2.0,
        )
    }
}

#[derive(Clone, Copy, Debug)]
struct PhysicalRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl PhysicalRect {
    fn right(self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Placement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug)]
enum TrayEdge {
    Top,
    Right,
    Bottom,
    Left,
}

fn monitor_bounds(monitor: &Monitor) -> PhysicalRect {
    PhysicalRect {
        x: monitor.position().x,
        y: monitor.position().y,
        width: monitor.size().width,
        height: monitor.size().height,
    }
}

fn monitor_work_area(monitor: &Monitor) -> PhysicalRect {
    PhysicalRect {
        x: monitor.work_area().position.x,
        y: monitor.work_area().position.y,
        width: monitor.work_area().size.width,
        height: monitor.work_area().size.height,
    }
}

fn distance_to_rect(point: (f64, f64), rect: PhysicalRect) -> f64 {
    let left = f64::from(rect.x);
    let top = f64::from(rect.y);
    let right = rect.right() as f64;
    let bottom = rect.bottom() as f64;
    let dx = if point.0 < left {
        left - point.0
    } else if point.0 >= right {
        point.0 - right
    } else {
        0.0
    };
    let dy = if point.1 < top {
        top - point.1
    } else if point.1 >= bottom {
        point.1 - bottom
    } else {
        0.0
    };
    dx * dx + dy * dy
}

fn monitor_index_for_point(monitors: &[PhysicalRect], point: (f64, f64)) -> Option<usize> {
    monitors
        .iter()
        .position(|monitor| {
            point.0 >= f64::from(monitor.x)
                && point.0 < monitor.right() as f64
                && point.1 >= f64::from(monitor.y)
                && point.1 < monitor.bottom() as f64
        })
        .or_else(|| {
            monitors
                .iter()
                .enumerate()
                .min_by(|(_, left), (_, right)| {
                    distance_to_rect(point, **left).total_cmp(&distance_to_rect(point, **right))
                })
                .map(|(index, _)| index)
        })
}

fn monitor_for_point(monitors: &[Monitor], point: (f64, f64)) -> Option<&Monitor> {
    let bounds: Vec<_> = monitors.iter().map(monitor_bounds).collect();
    monitor_index_for_point(&bounds, point).map(|index| &monitors[index])
}

fn edge_for_anchor(anchor: TrayAnchor, monitor: PhysicalRect) -> TrayEdge {
    let right = monitor.right() as f64;
    let bottom = monitor.bottom() as f64;
    let distances = [
        (TrayEdge::Top, (anchor.y - f64::from(monitor.y)).abs()),
        (
            TrayEdge::Right,
            (right - (anchor.x + f64::from(anchor.width))).abs(),
        ),
        (
            TrayEdge::Bottom,
            (bottom - (anchor.y + f64::from(anchor.height))).abs(),
        ),
        (TrayEdge::Left, (anchor.x - f64::from(monitor.x)).abs()),
    ];

    distances
        .into_iter()
        .min_by(|left, right| left.1.total_cmp(&right.1))
        .map(|(edge, _)| edge)
        .unwrap_or(TrayEdge::Bottom)
}

fn edge_for_tray(anchor: TrayAnchor, monitor: PhysicalRect, work_area: PhysicalRect) -> TrayEdge {
    let reserved = [
        (
            TrayEdge::Top,
            i64::from(work_area.y) - i64::from(monitor.y),
            anchor.y + f64::from(anchor.height) <= f64::from(work_area.y),
        ),
        (
            TrayEdge::Right,
            monitor.right() - work_area.right(),
            anchor.x >= work_area.right() as f64,
        ),
        (
            TrayEdge::Bottom,
            monitor.bottom() - work_area.bottom(),
            anchor.y + f64::from(anchor.height) >= work_area.bottom() as f64,
        ),
        (
            TrayEdge::Left,
            i64::from(work_area.x) - i64::from(monitor.x),
            anchor.x + f64::from(anchor.width) <= f64::from(work_area.x),
        ),
    ];

    reserved
        .into_iter()
        .filter(|(_, thickness, contains_anchor)| *thickness > 0 && *contains_anchor)
        .max_by_key(|(_, thickness, _)| *thickness)
        .map_or_else(|| edge_for_anchor(anchor, monitor), |(edge, _, _)| edge)
}

fn clamp_axis(start: i64, end: i64, size: u32, requested: i64) -> (i32, u32) {
    let available = (end - start).max(0);
    let size = i64::from(size).min(available) as u32;
    let max_start = end - i64::from(size);
    let position = requested.clamp(start, max_start);
    (
        position.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
        size,
    )
}

fn placement_for_area(
    monitor: PhysicalRect,
    work_area: PhysicalRect,
    anchor: Option<TrayAnchor>,
    popup_size: PhysicalSize<u32>,
    current_position: Option<PhysicalPosition<i32>>,
) -> Option<Placement> {
    if work_area.width == 0 || work_area.height == 0 {
        return None;
    }

    let current_position = current_position.unwrap_or(PhysicalPosition::new(
        work_area.x + (work_area.width.saturating_sub(popup_size.width) / 2) as i32,
        work_area.y + (work_area.height.saturating_sub(popup_size.height) / 2) as i32,
    ));
    let (tray_x, tray_y) = anchor.map_or((0.0, 0.0), TrayAnchor::center);
    let edge = anchor.map(|anchor| edge_for_tray(anchor, monitor, work_area));

    let work_left = i64::from(work_area.x);
    let work_top = i64::from(work_area.y);
    let work_right = work_area.right();
    let work_bottom = work_area.bottom();
    let width = popup_size.width.min(work_area.width);
    let height = popup_size.height.min(work_area.height);

    let requested_x = match edge {
        Some(TrayEdge::Left) => work_left,
        Some(TrayEdge::Right) => work_right - i64::from(width),
        Some(TrayEdge::Top | TrayEdge::Bottom) => (tray_x - f64::from(width) / 2.0).round() as i64,
        None => i64::from(current_position.x),
    };
    let requested_y = match edge {
        Some(TrayEdge::Top) => work_top,
        Some(TrayEdge::Bottom) => work_bottom - i64::from(height),
        Some(TrayEdge::Left | TrayEdge::Right) => (tray_y - f64::from(height) / 2.0).round() as i64,
        None => i64::from(current_position.y),
    };

    let (x, width) = clamp_axis(work_left, work_right, width, requested_x);
    let (y, height) = clamp_axis(work_top, work_bottom, height, requested_y);

    Some(Placement {
        x,
        y,
        width,
        height,
    })
}

fn inner_size_for_placement(
    original_outer: PhysicalSize<u32>,
    original_inner: PhysicalSize<u32>,
    placement: Placement,
) -> PhysicalSize<u32> {
    let horizontal_chrome = original_outer.width.saturating_sub(original_inner.width);
    let vertical_chrome = original_outer.height.saturating_sub(original_inner.height);

    PhysicalSize::new(
        placement.width.saturating_sub(horizontal_chrome).max(1),
        placement.height.saturating_sub(vertical_chrome).max(1),
    )
}

fn available_inner_size(
    work_area: PhysicalRect,
    outer_size: PhysicalSize<u32>,
    inner_size: PhysicalSize<u32>,
) -> PhysicalSize<u32> {
    PhysicalSize::new(
        work_area
            .width
            .saturating_sub(outer_size.width.saturating_sub(inner_size.width)),
        work_area
            .height
            .saturating_sub(outer_size.height.saturating_sub(inner_size.height)),
    )
}

struct WindowPlacement {
    placement: Placement,
    outer_size: PhysicalSize<u32>,
    inner_size: PhysicalSize<u32>,
    available_inner_size: PhysicalSize<u32>,
    scale_factor: f64,
}

fn placement_for_window(
    window: &WebviewWindow,
    anchor: Option<TrayAnchor>,
) -> Option<WindowPlacement> {
    // Iconic/zero-sized geometry is not the window's restore geometry.
    if window.is_minimized().unwrap_or(false) {
        return None;
    }
    let monitors = window.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }

    let current_position = window.outer_position().ok();
    let popup_size = window.outer_size().ok()?;
    let inner_size = window.inner_size().ok()?;
    if popup_size.width == 0
        || popup_size.height == 0
        || inner_size.width == 0
        || inner_size.height == 0
    {
        return None;
    }
    let point = anchor.map_or_else(
        || {
            let position = current_position.unwrap_or_default();
            (
                f64::from(position.x) + f64::from(popup_size.width) / 2.0,
                f64::from(position.y) + f64::from(popup_size.height) / 2.0,
            )
        },
        TrayAnchor::center,
    );
    let monitor = monitor_for_point(&monitors, point)?;
    let placement = placement_for_area(
        monitor_bounds(monitor),
        monitor_work_area(monitor),
        anchor,
        popup_size,
        current_position,
    )?;

    Some(WindowPlacement {
        placement,
        outer_size: popup_size,
        inner_size,
        available_inner_size: available_inner_size(
            monitor_work_area(monitor),
            popup_size,
            inner_size,
        ),
        scale_factor: monitor.scale_factor(),
    })
}

fn apply_placement(window: &WebviewWindow, geometry: WindowPlacement) {
    let target_inner_size =
        inner_size_for_placement(geometry.outer_size, geometry.inner_size, geometry.placement);
    let scale_factor = if geometry.scale_factor.is_finite() && geometry.scale_factor > 0.0 {
        geometry.scale_factor
    } else {
        1.0
    };
    let minimum_width =
        NORMAL_MIN_WIDTH.min(f64::from(geometry.available_inner_size.width) / scale_factor);
    let minimum_height =
        NORMAL_MIN_HEIGHT.min(f64::from(geometry.available_inner_size.height) / scale_factor);
    let minimums = (minimum_width.to_bits(), minimum_height.to_bits());
    let minimums_changed = APPLIED_MINIMUMS
        .lock()
        .map(|cached| *cached != Some(minimums))
        .unwrap_or(true);
    if minimums_changed {
        let constraints = WindowSizeConstraints {
            min_width: Some(LogicalUnit::new(minimum_width).into()),
            min_height: Some(LogicalUnit::new(minimum_height).into()),
            max_width: Some(LogicalUnit::new(NORMAL_MAX_WIDTH).into()),
            max_height: None,
        };
        if window.set_size_constraints(constraints).is_ok() {
            if let Ok(mut cached) = APPLIED_MINIMUMS.lock() {
                *cached = Some(minimums);
            }
        }
    }

    if target_inner_size != geometry.inner_size {
        let _ = window.set_size(target_inner_size);
    }

    let target_position = PhysicalPosition::new(geometry.placement.x, geometry.placement.y);
    if window.outer_position().ok() != Some(target_position) {
        let _ = window.set_position(target_position);
    }
}

/// Place the popup beside the tray anchor, or clamp its current position when no anchor exists.
pub(crate) fn place(window: &WebviewWindow, anchor: Option<TrayAnchor>) {
    if let Some(geometry) = placement_for_window(window, anchor) {
        apply_placement(window, geometry);
    }
}

/// Keep the window on a connected monitor after a display or scale-factor change.
pub(crate) fn keep_on_screen(window: &WebviewWindow) {
    place(window, None);
}

#[cfg(test)]
mod tests {
    use super::{
        inner_size_for_placement, monitor_index_for_point, placement_for_area, PhysicalRect,
        Placement, TrayAnchor,
    };
    use tauri::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Position, Size};

    fn rect(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect {
        PhysicalRect {
            x,
            y,
            width,
            height,
        }
    }

    fn anchor(x: f64, y: f64) -> TrayAnchor {
        TrayAnchor {
            x,
            y,
            width: 24,
            height: 24,
        }
    }

    fn place(anchor: TrayAnchor, monitor: PhysicalRect, work_area: PhysicalRect) -> Placement {
        placement_for_area(
            monitor,
            work_area,
            Some(anchor),
            PhysicalSize::new(380, 660),
            None,
        )
        .expect("valid monitor work area should produce a placement")
    }

    #[test]
    fn opens_away_from_each_taskbar_edge() {
        let monitor = rect(0, 0, 1920, 1080);
        let bottom_work_area = rect(0, 0, 1920, 1040);
        let top_work_area = rect(0, 40, 1920, 1040);
        let left_work_area = rect(40, 0, 1880, 1080);
        let right_work_area = rect(0, 0, 1880, 1080);

        assert_eq!(
            place(anchor(900.0, 1040.0), monitor, bottom_work_area),
            Placement {
                x: 722,
                y: 380,
                width: 380,
                height: 660
            }
        );
        assert_eq!(
            place(anchor(900.0, 0.0), monitor, top_work_area),
            Placement {
                x: 722,
                y: 40,
                width: 380,
                height: 660
            }
        );
        assert_eq!(
            place(anchor(0.0, 500.0), monitor, left_work_area),
            Placement {
                x: 40,
                y: 182,
                width: 380,
                height: 660
            }
        );
        assert_eq!(
            place(anchor(1896.0, 500.0), monitor, right_work_area),
            Placement {
                x: 1500,
                y: 182,
                width: 380,
                height: 660
            }
        );
    }

    #[test]
    fn bottom_taskbar_wins_over_a_touching_right_edge() {
        let monitor = rect(0, 0, 1920, 1080);
        let work_area = rect(0, 0, 1920, 1040);

        assert_eq!(
            place(anchor(1896.0, 1040.0), monitor, work_area),
            Placement {
                x: 1540,
                y: 380,
                width: 380,
                height: 660
            }
        );
    }

    #[test]
    fn keeps_negative_origins_and_hidpi_physical_dimensions() {
        let monitor = rect(-3840, -300, 3840, 2160);
        let work_area = rect(-3840, -300, 3840, 2100);
        let mut tray = anchor(-150.0, 1750.0);
        tray.width = 36;
        tray.height = 36;
        let placement = placement_for_area(
            monitor,
            work_area,
            Some(tray),
            PhysicalSize::new(570, 990),
            None,
        )
        .expect("valid monitor work area should produce a placement");

        assert_eq!(placement.x, -570);
        assert_eq!(placement.y, 810);
        assert_eq!((placement.width, placement.height), (570, 990));
    }

    #[test]
    fn selects_the_monitor_containing_negative_physical_coordinates() {
        let monitors = [rect(0, 0, 1920, 1080), rect(-2560, -200, 2560, 1440)];

        assert_eq!(
            monitor_index_for_point(&monitors, (-1500.0, 600.0)),
            Some(1)
        );
        assert_eq!(monitor_index_for_point(&monitors, (1920.0, 500.0)), Some(0));
        // A shared edge belongs to the monitor starting there, regardless of
        // enumeration order; zero distance alone also matches its neighbor.
        let left_first = [monitors[1], monitors[0]];
        assert_eq!(monitor_index_for_point(&left_first, (0.0, 500.0)), Some(1));
    }

    #[test]
    fn shrinks_oversized_popup_to_the_work_area_and_clamps_it() {
        let monitor = rect(-100, 20, 300, 250);
        let work_area = rect(-100, 20, 300, 220);
        let placement = placement_for_area(
            monitor,
            work_area,
            Some(anchor(0.0, 240.0)),
            PhysicalSize::new(380, 660),
            Some(PhysicalPosition::new(-500, -500)),
        )
        .expect("non-empty work area should produce a placement");

        assert_eq!(
            placement,
            Placement {
                x: -100,
                y: 20,
                width: 300,
                height: 220
            }
        );
    }

    #[test]
    fn fitting_outer_bounds_preserves_native_chrome_inside_the_work_area() {
        let target = Placement {
            x: 10,
            y: 20,
            width: 300,
            height: 250,
        };

        assert_eq!(
            inner_size_for_placement(
                PhysicalSize::new(400, 700),
                PhysicalSize::new(380, 660),
                target,
            ),
            PhysicalSize::new(280, 210)
        );
    }

    #[test]
    fn tray_rect_requires_physical_geometry() {
        let logical_rect = tauri::Rect {
            position: Position::Logical(LogicalPosition::new(10.0, 20.0)),
            size: Size::Logical(LogicalSize::new(24.0, 24.0)),
        };
        let physical_rect = tauri::Rect {
            position: Position::Physical(PhysicalPosition::new(15, 30)),
            size: Size::Physical(PhysicalSize::new(36, 36)),
        };

        assert!(TrayAnchor::from_rect(logical_rect).is_none());
        assert_eq!(
            TrayAnchor::from_rect(physical_rect),
            Some(TrayAnchor {
                x: 15.0,
                y: 30.0,
                width: 36,
                height: 36
            })
        );
    }
}
