using UnityEngine;

namespace Spinbound
{
    // The web game's numbers (src/game/config.ts), unchanged. The simulation runs in its pixel space
    // (y grows downward, floor top at 480); only rendering converts to Unity units (1 unit = 100 px).
    public static class Tuning
    {
        // Movement (PHYSICS).
        public const float Gravity = 1100, MaxFallSpeed = 900;
        public const float RunSpeed = 270, SprintSpeed = 350, SprintDelayMs = 700, SprintGain = 60;
        public const float BoostSpeed = 430, BoostLaunch = 400, BoostMs = 1100;
        public const float GroundAccel = 1000, BoostAccel = 1400, GroundDecel = 750, AirAccel = 550, AirDrag = 160, OverspeedDrag = 260;
        public const float JumpSpeed = 570, JumpCutSpeed = 260, JumpBufferMs = 100, CoyoteMs = 100;
        public const float RollMs = 2500, RollExitSpeed = 260;
        public const float DashSpeed = 340, DashMs = 450, DashCooldownMs = 900, DoubleTapMs = 260, DashBufferMs = 150;
        public const float MaxStepMs = 50, MaxSpeedX = 480;

        // Combat (COMBAT).
        public const float InvulnerableMs = 1000, KnockbackMs = 220, KnockbackSpeed = 260, KnockbackLift = 220;
        public const float StompBounce = 380, StompBounceHeld = 520, StompTolerance = 8, MinStompSpeed = 30, MinClosingSpeed = 100;
        public const float HitStopMs = 50, EnemySpeed = 65, TutorialRehitMs = 700, ScreenGraceMs = 650;
        public const float GroundLockMs = 120;

        // Roll-kill combo (COMBO, stage 1).
        public const float ComboWindowMs = 1800, ComboRollExtendMs = 400, ComboBoostMs = 900, ComboBaseSpeed = 420, ComboSpeedPerStep = 20, ComboMaxSpeed = 450;

        public const float PxPerUnit = 100, FloorTop = 480;
        public const float PlayerWidth = 30, PlayerHeight = 42;
        public const float EnemyWidth = 34, EnemyHeight = 36;

        public static float ToUnitsX(float x) => x / PxPerUnit;
        public static float ToUnitsY(float y) => (FloorTop - y) / PxPerUnit;
        public static Vector3 ToWorld(float x, float y, float z = 0) => new Vector3(ToUnitsX(x), ToUnitsY(y), z);
    }
}
