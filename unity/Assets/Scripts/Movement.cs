using System;

namespace Spinbound
{
    // Line-for-line port of the web game's engine-free movement rules (src/game/movement.ts).
    // Times are milliseconds, speeds px/s.
    public class RunState { public float vx; public float sprint; public float sprintHeldMs; }
    public class JumpState { public double lastGroundedAt = double.NegativeInfinity; public double jumpPressedAt = double.NegativeInfinity; public bool cuttable; }
    public class TapState { public int direction; public double releasedAt = double.NegativeInfinity; }
    public class DashState { public int direction; public double until = double.NegativeInfinity; public double readyAt = double.NegativeInfinity; public int requested; public double requestedAt = double.NegativeInfinity; }
    public class ComboState { public int count; public double lastAt = double.NegativeInfinity; }

    public static class Movement
    {
        static float Approach(float value, float target, float step) => value < target ? Math.Min(target, value + step) : Math.Max(target, value - step);

        public static float SpeedCap(RunState run, bool boosted) => boosted ? Tuning.BoostSpeed : Tuning.RunSpeed + run.sprint;

        public static float StepRun(RunState run, int direction, bool grounded, bool boosted, float deltaMs)
        {
            float dt = Math.Min(Math.Max(deltaMs, 0), Tuning.MaxStepMs) / 1000f;
            int moving = Math.Sign(run.vx);
            float speed = Math.Abs(run.vx);
            // Sprint momentum is kept in the air and lost on the ground when the run is broken.
            if (direction != 0 && direction == moving && grounded && speed >= Tuning.RunSpeed + run.sprint - 5)
            {
                run.sprintHeldMs += deltaMs;
                if (run.sprintHeldMs >= Tuning.SprintDelayMs) run.sprint = Math.Min(Tuning.SprintSpeed - Tuning.RunSpeed, run.sprint + Tuning.SprintGain * dt);
            }
            else if (direction != moving || (grounded && speed < Tuning.RunSpeed * 0.8f))
            {
                if (grounded || (direction != 0 && direction != moving)) { run.sprint = 0; run.sprintHeldMs = 0; }
            }
            float cap = SpeedCap(run, boosted);
            if (direction == 0) run.vx = Approach(run.vx, 0, (grounded ? Tuning.GroundDecel : Tuning.AirDrag) * dt);
            else if (moving != 0 && moving != direction) run.vx = Approach(run.vx, 0, (grounded ? Tuning.GroundDecel + Tuning.GroundAccel : Tuning.AirAccel + Tuning.AirDrag) * dt);
            else if (speed > cap) run.vx = direction * Math.Max(cap, speed - (grounded ? Tuning.OverspeedDrag : Tuning.AirDrag) * dt);
            else
            {
                float accel = !grounded ? Tuning.AirAccel : boosted ? Tuning.BoostAccel : Tuning.GroundAccel;
                run.vx = direction * Math.Min(cap, speed + accel * dt);
            }
            return run.vx;
        }

        public static void ResetRun(RunState run, float vx = 0) { run.vx = vx; run.sprint = 0; run.sprintHeldMs = 0; }

        public static float ApplyBoost(RunState run, int direction)
        {
            run.vx = direction * Math.Max(Math.Abs(run.vx), Tuning.BoostLaunch);
            run.sprint = Tuning.SprintSpeed - Tuning.RunSpeed;
            run.sprintHeldMs = Tuning.SprintDelayMs;
            return run.vx;
        }

        // A press of the same direction within DoubleTapMs of its last release asks for a spin dash.
        public static bool RegisterTap(TapState taps, int direction, double at)
        {
            bool dash = taps.direction == direction && at - taps.releasedAt <= Tuning.DoubleTapMs;
            taps.direction = dash ? 0 : direction;
            taps.releasedAt = double.NegativeInfinity;
            return dash;
        }

        public static void RegisterRelease(TapState taps, int direction, double at) { if (taps.direction == direction) taps.releasedAt = at; }

        public static void RequestDash(DashState dash, int direction, double now) { dash.requested = direction; dash.requestedAt = now; }

        // Spin dash from the ground; a request waits DashBufferMs for the ground (a double tap just before landing).
        public static float? TryDash(DashState dash, RunState run, bool grounded, double now)
        {
            if (dash.requested == 0) return null;
            if (now - dash.requestedAt > Tuning.DashBufferMs) { dash.requested = 0; return null; }
            if (!grounded || now < dash.readyAt) return null;
            int direction = dash.requested;
            dash.requested = 0;
            dash.direction = direction;
            dash.until = now + Tuning.DashMs;
            dash.readyAt = now + Tuning.DashCooldownMs;
            float kept = Math.Sign(run.vx) == direction ? Math.Abs(run.vx) : 0;
            run.vx = direction * Math.Max(kept, Tuning.DashSpeed);
            run.sprint = Tuning.SprintSpeed - Tuning.RunSpeed;
            run.sprintHeldMs = Tuning.SprintDelayMs;
            return run.vx;
        }

        // During a dash a released button still moves in the dash direction; pressing the other way ends it.
        public static int DashDirection(DashState dash, int input, double now)
        {
            if (now >= dash.until) return input;
            if (input != 0 && input != dash.direction) { dash.until = double.NegativeInfinity; return input; }
            return dash.direction;
        }

        public static float? TryJump(JumpState jump, double now)
        {
            if (now - jump.jumpPressedAt > Tuning.JumpBufferMs || now - jump.lastGroundedAt > Tuning.CoyoteMs) return null;
            jump.jumpPressedAt = double.NegativeInfinity;
            jump.lastGroundedAt = double.NegativeInfinity;
            jump.cuttable = true;
            return -Tuning.JumpSpeed;
        }

        public static float CutJump(JumpState jump, float vy, bool held)
        {
            if (!jump.cuttable) return vy;
            if (vy >= 0) { jump.cuttable = false; return vy; }
            if (held) return vy;
            jump.cuttable = false;
            return Math.Max(vy, -Tuning.JumpCutSpeed);
        }

        public static bool NextRolling(bool rolling, float speed, bool blocked, double timeLeft) =>
            rolling && !blocked && timeLeft > 0 && speed >= Tuning.RollExitSpeed;

        // Roll kills within the window chain; from the second on the roll speeds up.
        public static (int count, float speed) RegisterRollKill(ComboState combo, double now)
        {
            combo.count = now - combo.lastAt <= Tuning.ComboWindowMs ? combo.count + 1 : 1;
            combo.lastAt = now;
            float speed = combo.count >= 2 ? Math.Min(Tuning.ComboMaxSpeed, Tuning.ComboBaseSpeed + Tuning.ComboSpeedPerStep * (combo.count - 2)) : 0;
            return (combo.count, speed);
        }
    }

    // Port of src/game/contact.ts. Boxes are top-left based; prev is the position before this step.
    public struct ContactBox { public float x, y, prevX, prevY, width, height, vx, vy; }
    public enum ContactKind { Stomp, Roll, Touch }

    public static class Contact
    {
        public static bool IsStomp(ContactBox p, ContactBox t) =>
            p.vy >= 0 && p.vy - t.vy > Tuning.MinStompSpeed && p.prevY + p.height <= t.prevY + Tuning.StompTolerance;

        public static bool IsRollHit(ContactBox p, bool rolling, ContactBox t)
        {
            if (!rolling || Math.Abs(p.vx) < Tuning.RollExitSpeed) return false;
            int side = Math.Sign((t.prevX + t.width / 2) - (p.prevX + p.width / 2));
            if (side == 0 || side != Math.Sign(p.vx)) return false;
            return (p.vx - t.vx) * side >= Tuning.MinClosingSpeed;
        }

        public static ContactKind Classify(ContactBox p, bool rolling, ContactBox t) =>
            IsStomp(p, t) ? ContactKind.Stomp : IsRollHit(p, rolling, t) ? ContactKind.Roll : ContactKind.Touch;
    }
}
