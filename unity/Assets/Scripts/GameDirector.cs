using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace Spinbound
{
    // Runs the test stage: a fixed 60 Hz simulation in the web game's pixel space (same rules and order as
    // the Phaser scene: physics, contacts, then input), and views that interpolate between steps.
    public class GameDirector : MonoBehaviour
    {
        const float StepMs = 1000f / 60f;
        const int MaxHp = 3;
        const double RespawnDelayMs = 1500;

        Stage stage;
        PlayerSim player;
        readonly List<EnemySim> enemies = new();
        readonly List<EnemyView> enemyViews = new();
        PlayerView robot;
        CameraRig cam;
        Hud hud;
        Fx fx;
        GameInput input;
        Volume volume;
        InputFrame lastInput;
        readonly ComboState combo = new();
        Transform checkpointCrystal;

        double now, hitStopUntil, deadAt, boostReadyAt, playSeconds;
        int hp = MaxHp, kills, bestCombo;
        bool finished, checkpointActive, dashCelebrated;
        Vector2 respawn;
        Vector3 robotPrev, robotCur;
        readonly List<(Vector3 prev, Vector3 cur)> enemyPos = new();
        float stepDust;

        void Awake()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            Application.targetFrameRate = -1; // the browser paces frames (requestAnimationFrame)
#else
            Application.targetFrameRate = 60;
#endif
            Time.fixedDeltaTime = StepMs / 1000f;
            stage = new Stage();
            respawn = stage.start;
            stage.Build();
            Lights();
            BuildProps();

            input = new GameInput();
            player = new PlayerSim();
            player.body.Reset(stage.start.x, stage.start.y);
            robot = PlayerView.Create();
            for (int i = 0; i < stage.enemies.Count; i++)
            {
                var (x, min, max) = stage.enemies[i];
                enemies.Add(new EnemySim(x, min, max));
                enemyViews.Add(EnemyView.Create(i));
                enemyPos.Add((Vector3.zero, Vector3.zero));
            }
            fx = Fx.Create();
            var cameraObject = new GameObject("Main Camera") { tag = "MainCamera" };
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.55f, 0.78f, 0.98f);
            camera.nearClipPlane = 0.3f; camera.farClipPlane = 200;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = true;
            cam = new CameraRig(camera);
            hud = Hud.Create(input);
            hud.onRetry = () => SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            hud.onToggleFx = () => { volume.enabled = !volume.enabled; hud.SetStatus(volume.enabled ? "post FX on" : "post FX off"); };
            hud.SetHp(hp);
            hud.SetStatus("double tap a direction: spin dash");
            Capture();
            robotPrev = robotCur;
            cam.Update(0, player.body.CenterX, player.body.CenterY, 0, 1, true);
        }

        void Lights()
        {
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.95f, 0.86f);
            sun.intensity = 1.25f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(48, -35, 0);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.62f, 0.75f, 0.95f);
            RenderSettings.ambientEquatorColor = new Color(0.62f, 0.7f, 0.68f);
            RenderSettings.ambientGroundColor = new Color(0.36f, 0.32f, 0.28f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.72f, 0.86f, 0.98f);
            RenderSettings.fogStartDistance = 22; RenderSettings.fogEndDistance = 70;

            volume = new GameObject("PostFx").AddComponent<Volume>();
            volume.isGlobal = true;
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var bloom = profile.Add<Bloom>(true); bloom.intensity.Override(0.5f); bloom.threshold.Override(0.95f);
            profile.Add<Tonemapping>(true).mode.Override(TonemappingMode.Neutral);
            var vignette = profile.Add<Vignette>(true); vignette.intensity.Override(0.22f);
            var color = profile.Add<ColorAdjustments>(true); color.saturation.Override(12); color.contrast.Override(8);
            volume.profile = profile;
        }

        void BuildProps()
        {
            var root = new GameObject("Props").transform;
            var padMat = Art.Lit(new Color(0.2f, 0.95f, 1f), 0.6f);
            foreach (float x in stage.boosters)
            {
                Art.Shape(PrimitiveType.Cube, root, Tuning.ToWorld(x, Tuning.FloorTop - 2), new Vector3(0.8f, 0.05f, 0.9f), padMat, false);
                for (int i = 0; i < 3; i++)
                    Art.Shape(PrimitiveType.Cube, root, Tuning.ToWorld(x - 24 + i * 24, Tuning.FloorTop - 5), new Vector3(0.12f, 0.02f, 0.4f), Art.Lit(Color.white), false)
                        .transform.localRotation = Quaternion.Euler(0, 45, 0);
            }
            var pole = Art.Lit(new Color(0.85f, 0.85f, 0.9f), 0.5f, 0.6f);
            Art.Shape(PrimitiveType.Cylinder, root, Tuning.ToWorld(stage.checkpointX, Tuning.FloorTop - 40, 0.6f), new Vector3(0.08f, 0.4f, 0.08f), pole);
            checkpointCrystal = Art.Shape(PrimitiveType.Cube, root, Tuning.ToWorld(stage.checkpointX, Tuning.FloorTop - 100, 0.6f), Vector3.one * 0.2f, Art.Lit(new Color(0.55f, 0.6f, 0.7f), 0.8f)).transform;
            Art.Shape(PrimitiveType.Cylinder, root, Tuning.ToWorld(stage.goalX, Tuning.FloorTop - 90, 0.5f), new Vector3(0.07f, 0.9f, 0.07f), pole);
            Art.Shape(PrimitiveType.Cube, root, Tuning.ToWorld(stage.goalX + 35, Tuning.FloorTop - 150, 0.5f), new Vector3(0.62f, 0.4f, 0.04f), Art.Lit(new Color(1f, 0.82f, 0.25f), 0.3f));
        }

        void Update()
        {
            input.ReadKeyboard();
            float alpha = Mathf.Clamp01((Time.time - Time.fixedTime) / Time.fixedDeltaTime);
            var feet = Vector3.Lerp(robotPrev, robotCur, alpha);
            robot.Render(player, feet, now, finished);
            for (int i = 0; i < enemies.Count; i++) enemyViews[i].Render(enemies[i], Vector3.Lerp(enemyPos[i].prev, enemyPos[i].cur, alpha));
            cam.Update(Time.deltaTime, feet.x * 100, Tuning.FloorTop - feet.y * 100 - Tuning.PlayerHeight / 2, player.body.vx, player.facing);
            if (checkpointCrystal) checkpointCrystal.Rotate(0, 90 * Time.deltaTime, 0, Space.World);
            if (player.rolling && !finished) fx.Trail(feet + Vector3.up * 0.3f + Vector3.back * 0.05f);
            hud.SetTimer(playSeconds);
        }

        void FixedUpdate()
        {
            now += StepMs;
            Tick(StepMs);
            Capture();
        }

        void Capture()
        {
            robotPrev = robotCur;
            robotCur = Tuning.ToWorld(player.body.CenterX, player.body.Bottom);
            for (int i = 0; i < enemies.Count; i++)
                enemyPos[i] = (enemyPos[i].cur == Vector3.zero ? Feet(enemies[i]) : enemyPos[i].cur, Feet(enemies[i]));
        }

        static Vector3 Feet(EnemySim e) => Tuning.ToWorld(e.body.CenterX, e.body.Bottom);

        void Tick(float deltaMs)
        {
            if (finished) return;
            if (player.dead)
            {
                if (now - deadAt >= RespawnDelayMs) Respawn();
                return;
            }
            if (now < hitStopUntil) return;
            float dt = deltaMs / 1000f;
            playSeconds += dt;

            // 1. Physics.
            SimPhysics.Step(player.body, stage.solids, dt);
            foreach (var e in enemies)
            {
                e.body.prevX = e.body.x; e.body.prevY = e.body.y;
                if (e.alive) e.body.x += e.body.vx * dt;
            }

            // 2. Contacts.
            foreach (float x in stage.boosters)
                if (now >= boostReadyAt && player.body.blockedDown && Mathf.Abs(player.body.CenterX - x) < 40)
                {
                    player.Boost(now); boostReadyAt = now + 400;
                    fx.Burst(Tuning.ToWorld(player.body.CenterX, player.body.Bottom), new Color(0.4f, 1f, 1f), 18, 3f, 0.12f, 0.4f);
                }
            if (!checkpointActive && player.body.CenterX >= stage.checkpointX)
            {
                checkpointActive = true;
                respawn = new Vector2(stage.checkpointX, 440);
                checkpointCrystal.GetComponent<MeshRenderer>().sharedMaterial = Art.Lit(new Color(0.3f, 1f, 1f), 0.9f);
                fx.Burst(checkpointCrystal.position, new Color(0.4f, 1f, 1f), 30, 2.5f);
                hud.SetStatus("checkpoint!");
            }
            foreach (var e in enemies)
                if (e.alive && player.body.Overlaps(e.body)) TouchEnemy(e);
            if (player.dead || finished) return;
            if (player.body.CenterX >= stage.goalX) { Clear(); return; }

            // 3. Input and movement (web order: after physics and contacts).
            var frame = input.Poll();
            lastInput = frame;
            var step = player.Update(now, deltaMs, frame);
            var feet = Tuning.ToWorld(player.body.CenterX, player.body.Bottom);
            if (step.jumped) fx.Burst(feet, new Color(0.95f, 0.9f, 0.8f, 0.8f), 6, 1.2f, 0.12f, 0.3f, 1f);
            if (step.dashed) { fx.Burst(feet + Vector3.up * 0.3f, new Color(0.4f, 1f, 1f), 14, 2.5f, 0.12f, 0.35f); cam.Shake(0.03f); }
            if (step.landed) { robot.Land(step.landingSpeed / 650f); if (step.landingSpeed > 260) fx.Burst(feet, new Color(0.9f, 0.85f, 0.75f, 0.8f), 10, 1.6f, 0.14f, 0.35f, 1f); }
            if (player.IsGrounded(now) && !player.rolling && Mathf.Abs(player.body.vx) > 200 && (stepDust += deltaMs) > 90) { stepDust = 0; fx.Dust(feet, (int)Mathf.Sign(player.body.vx)); }

            var view = cam.Visible(player.body.CenterX);
            foreach (var e in enemies)
                e.Update(now, e.body.CenterX > view.left && e.body.CenterX < view.right);

            if (player.body.x < 0) { player.body.x = 0; player.body.vx = Mathf.Max(0, player.body.vx); }
            if (player.body.y > 720) Die("fell in");
        }

        void TouchEnemy(EnemySim e)
        {
            var kind = Contact.Classify(player.body.Box(), player.rolling, e.body.Box());
            if (kind == ContactKind.Touch)
            {
                if (e.CanHurt(now) && TakeHit(e.body.CenterX)) e.AfterHurting(now, player.body.CenterX);
                return;
            }
            // One hit defeats a walker.
            e.alive = false;
            kills++;
            var at = Tuning.ToWorld(e.body.CenterX, e.body.CenterY);
            fx.Burst(at, new Color(0.55f, 1f, 0.45f), 22, 3.2f, 0.14f, 0.5f);
            fx.Burst(at, new Color(1f, 0.95f, 0.6f), 10, 4.5f, 0.08f, 0.25f);
            cam.Shake(0.05f);
            if (kind == ContactKind.Stomp)
            {
                player.StompBounce(now, lastInput.jumpHeld);
                hud.Popup("+200", at, Color.white);
                Stop(Tuning.HitStopMs);
                return;
            }
            // Roll kill: the robot pops out with a punch, the chain keeps the roll going.
            robot.Punch();
            var (count, speed) = Movement.RegisterRollKill(combo, now);
            player.ComboBoost(now, speed);
            bestCombo = Mathf.Max(bestCombo, count);
            hud.Popup(count >= 2 ? $"{count} COMBO!" : "+200", at + Vector3.up * 0.3f, count >= 2 ? new Color(1f, 0.85f, 0.3f) : Color.white);
            if (player.rollFromDash && !dashCelebrated)
            {
                dashCelebrated = true;
                hud.Popup("DASH HIT!", at + Vector3.up * 0.8f, new Color(0.4f, 1f, 1f));
                Stop(110);
            }
            else Stop(Tuning.HitStopMs + 30);
        }

        bool TakeHit(float sourceX)
        {
            if (player.IsInvulnerable(now)) return false;
            player.invulnerableUntil = now + Tuning.InvulnerableMs;
            hp--;
            hud.SetHp(hp);
            combo.count = 0; combo.lastAt = double.NegativeInfinity;
            cam.Shake(0.08f);
            fx.Burst(Tuning.ToWorld(player.body.CenterX, player.body.CenterY), new Color(1f, 0.4f, 0.4f), 14, 2.5f);
            if (hp <= 0) { Die("ouch"); return true; }
            player.Knockback(now, sourceX);
            return true;
        }

        void Die(string why)
        {
            if (player.dead) return;
            hp = 0; hud.SetHp(0);
            player.Die();
            deadAt = now;
            combo.count = 0; combo.lastAt = double.NegativeInfinity;
            input.Reset();
            hud.SetStatus(checkpointActive ? $"{why} - back to the checkpoint" : $"{why} - back to the start");
        }

        void Respawn()
        {
            hp = MaxHp; hud.SetHp(hp);
            player.Respawn(respawn.x, respawn.y, now);
            robotPrev = robotCur = Tuning.ToWorld(player.body.CenterX, player.body.Bottom);
            cam.Update(0, player.body.CenterX, player.body.CenterY, 0, 1, true);
            input.Reset();
        }

        void Stop(double ms) => hitStopUntil = System.Math.Max(hitStopUntil, now + ms);

        void Clear()
        {
            finished = true;
            player.Stop();
            input.Reset();
            fx.Burst(Tuning.ToWorld(player.body.CenterX, player.body.CenterY - 40), new Color(1f, 0.85f, 0.3f), 60, 5f, 0.14f, 1.2f);
            hud.ShowClear(playSeconds, kills, bestCombo);
            hud.SetStatus("clear!");
        }

        // Called from the page (index.html) once the build has loaded.
        public void OnLoadTime(string ms) { if (double.TryParse(ms, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value)) hud.loadMs = value; }
    }
}
