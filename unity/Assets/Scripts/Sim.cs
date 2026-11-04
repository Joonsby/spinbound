using System;
using System.Collections.Generic;

namespace Spinbound
{
    public struct Rect2
    {
        public float left, top, right, bottom;
        public Rect2(float left, float top, float right, float bottom) { this.left = left; this.top = top; this.right = right; this.bottom = bottom; }
    }

    public struct InputFrame { public int direction; public bool jumpPressed; public bool jumpHeld; public int dash; }

    // Arcade-style box body (Phaser conventions: x/y is the top-left, y grows downward).
    public class SimBody
    {
        public float x, y, w, h, vx, vy, prevX, prevY;
        public bool gravity = true, blockedDown;
        public float CenterX => x + w / 2;
        public float CenterY => y + h / 2;
        public float Bottom => y + h;
        public ContactBox Box() => new ContactBox { x = x, y = y, prevX = prevX, prevY = prevY, width = w, height = h, vx = vx, vy = vy };
        public bool Overlaps(SimBody o) => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h;
        public void Reset(float centerX, float centerY) { x = prevX = centerX - w / 2; y = prevY = centerY - h / 2; vx = vy = 0; blockedDown = false; }
    }

    public static class SimPhysics
    {
        const float Eps = 0.01f;

        // One fixed step: gravity, then move and separate on x, then on y.
        public static void Step(SimBody b, List<Rect2> solids, float dt)
        {
            b.prevX = b.x; b.prevY = b.y;
            b.blockedDown = false;
            if (b.gravity) b.vy = Math.Min(b.vy + Tuning.Gravity * dt, Tuning.MaxFallSpeed);
            b.vx = Math.Max(-Tuning.MaxSpeedX, Math.Min(Tuning.MaxSpeedX, b.vx));
            b.x += b.vx * dt;
            foreach (var s in solids)
            {
                if (!(b.x < s.right - Eps && b.x + b.w > s.left + Eps && b.y < s.bottom - Eps && b.y + b.h > s.top + Eps)) continue;
                if (b.prevX + b.w <= s.left + Eps) { b.x = s.left - b.w; b.vx = 0; }
                else if (b.prevX >= s.right - Eps) { b.x = s.right; b.vx = 0; }
            }
            b.y += b.vy * dt;
            foreach (var s in solids)
            {
                if (!(b.x < s.right - Eps && b.x + b.w > s.left + Eps && b.y < s.bottom - Eps && b.y + b.h > s.top + Eps)) continue;
                if (b.vy >= 0 && b.prevY + b.h <= s.top + 4) { b.y = s.top - b.h; b.vy = 0; b.blockedDown = true; }
                else if (b.vy < 0 && b.prevY >= s.bottom - 4) { b.y = s.bottom; b.vy = 0; }
            }
            // Resting exactly on a floor counts as standing on it.
            if (!b.blockedDown && b.vy >= 0)
                foreach (var s in solids)
                    if (Math.Abs(b.y + b.h - s.top) < 0.5f && b.x < s.right && b.x + b.w > s.left) { b.blockedDown = true; break; }
        }
    }

    public struct PlayerFrame { public bool jumped, landed, dashed; public float landingSpeed; }

    // Port of src/game/player.ts: input to velocities, rolls, knockback. Physics runs in SimPhysics.
    public class PlayerSim
    {
        public readonly SimBody body = new SimBody { w = Tuning.PlayerWidth, h = Tuning.PlayerHeight };
        public readonly RunState run = new RunState();
        public readonly JumpState jump = new JumpState();
        public readonly DashState dash = new DashState();
        public bool rolling, rollFromDash, dead;
        public int facing = 1;
        public double boostUntil, rollUntil, hurtUntil, controlLockUntil, invulnerableUntil, groundLockUntil;
        bool wasGrounded;
        float lastVy;

        public bool IsGrounded(double now) => body.blockedDown && now >= groundLockUntil;
        public bool IsHurt(double now) => now < hurtUntil;
        public bool IsBoosted(double now) => now < boostUntil;
        public bool IsInvulnerable(double now) => now < invulnerableUntil;

        public PlayerFrame Update(double now, float deltaMs, InputFrame input)
        {
            var frame = new PlayerFrame();
            if (dead) return frame;
            bool grounded = IsGrounded(now);
            if (grounded && !wasGrounded) { frame.landed = true; frame.landingSpeed = lastVy; }
            wasGrounded = grounded;
            if (grounded) jump.lastGroundedAt = now;
            if (input.jumpPressed) jump.jumpPressedAt = now;
            if (now >= controlLockUntil)
            {
                run.vx = body.vx;
                if (input.dash != 0) Movement.RequestDash(dash, input.dash, now);
                if (Movement.TryDash(dash, run, grounded, now) != null)
                {
                    frame.dashed = true;
                    rollFromDash = true;
                    StartRoll(now, Tuning.DashMs);
                }
                int direction = Movement.DashDirection(dash, input.direction, now);
                if (direction != 0) facing = direction;
                body.vx = Movement.StepRun(run, direction, grounded, IsBoosted(now), deltaMs);
                float? jumpVy = Movement.TryJump(jump, now);
                if (jumpVy != null)
                {
                    groundLockUntil = now + Tuning.GroundLockMs;
                    wasGrounded = false;
                    body.vy = jumpVy.Value;
                    frame.jumped = true;
                }
                else body.vy = Movement.CutJump(jump, body.vy, input.jumpHeld);
            }
            rolling = Movement.NextRolling(rolling, Math.Abs(body.vx), IsHurt(now), rollUntil - now);
            if (!rolling) rollFromDash = false;
            lastVy = body.vy;
            return frame;
        }

        public void Boost(double now)
        {
            int direction = Math.Abs(body.vx) > 20 ? Math.Sign(body.vx) : facing;
            boostUntil = now + Tuning.BoostMs;
            rollFromDash = false;
            body.vx = Movement.ApplyBoost(run, direction);
            StartRoll(now, Tuning.RollMs);
        }

        void StartRoll(double now, float ms) { rolling = true; rollUntil = Math.Max(rollUntil, now + ms); }

        public void ComboBoost(double now, float speed)
        {
            if (!rolling) return;
            rollUntil = Math.Max(rollUntil, now + Tuning.ComboRollExtendMs);
            if (speed <= 0) return;
            int direction = Math.Abs(body.vx) > 20 ? Math.Sign(body.vx) : facing;
            boostUntil = Math.Max(boostUntil, now + Tuning.ComboBoostMs);
            run.vx = direction * Math.Max(Math.Abs(body.vx), speed);
            body.vx = run.vx;
        }

        public void Launch(double now, float? vx, float vy)
        {
            if (vx != null) { body.vx = vx.Value; run.vx = vx.Value; }
            body.vy = vy;
            jump.cuttable = false;
            jump.lastGroundedAt = double.NegativeInfinity;
            groundLockUntil = now + Tuning.GroundLockMs;
            wasGrounded = false;
        }

        public void StompBounce(double now, bool held) => Launch(now, null, -(held ? Tuning.StompBounceHeld : Tuning.StompBounce));

        public void Knockback(double now, float sourceX)
        {
            int direction = body.CenterX < sourceX ? -1 : 1;
            rolling = false;
            boostUntil = 0;
            dash.until = double.NegativeInfinity; dash.requested = 0;
            hurtUntil = controlLockUntil = now + Tuning.KnockbackMs;
            Movement.ResetRun(run);
            Launch(now, direction * Tuning.KnockbackSpeed, -Tuning.KnockbackLift);
        }

        public void Die() { dead = true; rolling = false; body.vx = body.vy = 0; }

        public void Respawn(float x, float y, double now)
        {
            dead = false; rolling = false;
            body.Reset(x, y);
            Movement.ResetRun(run);
            jump.lastGroundedAt = jump.jumpPressedAt = double.NegativeInfinity;
            jump.cuttable = false;
            boostUntil = rollUntil = hurtUntil = controlLockUntil = groundLockUntil = 0;
            dash.until = dash.readyAt = double.NegativeInfinity; dash.requested = 0;
            invulnerableUntil = now + Tuning.InvulnerableMs;
            wasGrounded = false; lastVy = 0;
        }

        public void Stop() { Movement.ResetRun(run); rolling = false; dash.until = double.NegativeInfinity; dash.requested = 0; body.vx = body.vy = 0; }
    }

    // Patrol walker (src/game/enemies.ts): paces between min and max; one hit defeats it.
    public class EnemySim
    {
        public readonly SimBody body = new SimBody { w = Tuning.EnemyWidth, h = Tuning.EnemyHeight, gravity = false };
        public float min, max;
        public bool alive = true;
        public int direction = 1;
        public double contactReadyAt = double.PositiveInfinity, defeatedAt;

        public EnemySim(float x, float min, float max)
        {
            this.min = min; this.max = max;
            body.Reset(x, Tuning.FloorTop - Tuning.EnemyHeight / 2);
            body.vx = Tuning.EnemySpeed;
        }

        // Stage 1 rule: an enemy only hurts once it has been on screen for a moment.
        public void Update(double now, bool visible)
        {
            if (!alive) return;
            if (!visible) contactReadyAt = double.PositiveInfinity;
            else if (double.IsPositiveInfinity(contactReadyAt)) contactReadyAt = now + Tuning.ScreenGraceMs;
            if (body.CenterX <= min && body.vx <= 0) { body.x = min - body.w / 2; body.vx = Tuning.EnemySpeed; }
            else if (body.CenterX >= max && body.vx >= 0) { body.x = max - body.w / 2; body.vx = -Tuning.EnemySpeed; }
            direction = Math.Sign(body.vx) != 0 ? Math.Sign(body.vx) : direction;
        }

        public bool CanHurt(double now) => alive && now >= contactReadyAt;

        // The enemy that just hurt the robot holds off past its invulnerability and turns away.
        public void AfterHurting(double now, float playerX)
        {
            contactReadyAt = Math.Max(contactReadyAt, now + Tuning.InvulnerableMs + Tuning.TutorialRehitMs);
            direction = body.CenterX < playerX ? -1 : 1;
            body.vx = Tuning.EnemySpeed * direction;
        }
    }
}
