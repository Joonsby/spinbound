using System.Collections.Generic;
using UnityEngine;

namespace Spinbound
{
    // A jelly slime: squashes as it hops along, flattens and pops when defeated.
    public class EnemyView : MonoBehaviour
    {
        Transform body;
        float phase, defeatedAt = -1;

        public static EnemyView Create(int index)
        {
            var view = new GameObject("Slime").AddComponent<EnemyView>();
            view.phase = index * 1.7f;
            view.body = new GameObject("Body").transform;
            view.body.SetParent(view.transform, false);
            var jelly = Art.Lit(new Color(0.42f, 0.86f, 0.38f), 0.75f);
            var white = Art.Lit(Color.white, 0.6f);
            var black = Art.Lit(new Color(0.1f, 0.1f, 0.14f), 0.8f);
            Art.Shape(PrimitiveType.Sphere, view.body, new Vector3(0, 0.2f, 0), new Vector3(0.48f, 0.4f, 0.44f), jelly);
            foreach (float side in new[] { -1f, 1f })
            {
                Art.Shape(PrimitiveType.Sphere, view.body, new Vector3(0.17f, 0.27f, side * 0.09f), Vector3.one * 0.1f, white, false);
                Art.Shape(PrimitiveType.Sphere, view.body, new Vector3(0.215f, 0.27f, side * 0.09f), Vector3.one * 0.05f, black, false);
            }
            return view;
        }

        public void Render(EnemySim e, Vector3 feet)
        {
            transform.position = feet;
            if (!e.alive)
            {
                if (defeatedAt < 0) defeatedAt = Time.time;
                float t = (Time.time - defeatedAt) / 0.35f;
                body.localScale = new Vector3(1 + t * 0.6f, Mathf.Max(0.02f, 1 - t * 1.4f), 1 + t * 0.6f);
                if (t >= 1) gameObject.SetActive(false);
                return;
            }
            float bob = Mathf.Sin(Time.time * 9 + phase);
            body.localScale = new Vector3(1 - bob * 0.06f, 1 + bob * 0.09f, 1 - bob * 0.06f);
            body.localPosition = new Vector3(0, Mathf.Max(0, bob) * 0.04f, 0);
            body.localRotation = Quaternion.Euler(0, e.direction > 0 ? 35 : 145, 0);
        }
    }

    // Particle bursts from one pooled system (soft dots, coloured per burst) and floating popups.
    public class Fx : MonoBehaviour
    {
        ParticleSystem system;

        public static Fx Create()
        {
            var fx = new GameObject("Fx").AddComponent<Fx>();
            fx.system = fx.gameObject.AddComponent<ParticleSystem>();
            fx.system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = fx.system.main;
            main.playOnAwake = false;
            main.loop = false;
            main.maxParticles = 600;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 0.6f;
            var emission = fx.system.emission; emission.enabled = false;
            var shape = fx.system.shape; shape.enabled = false;
            var size = fx.system.sizeOverLifetime; size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1, AnimationCurve.EaseInOut(0, 1, 1, 0));
            var renderer = fx.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = Art.Glow(Color.white, Art.SoftDot);
            fx.system.Play();
            return fx;
        }

        public void Burst(Vector3 at, Color color, int count, float speed, float size = 0.12f, float life = 0.45f, float upward = 0.5f)
        {
            var p = new ParticleSystem.EmitParams();
            for (int i = 0; i < count; i++)
            {
                var dir = Random.insideUnitSphere; dir.y = Mathf.Abs(dir.y) * upward + (1 - upward) * dir.y; dir.z *= 0.4f;
                p.position = at;
                p.velocity = dir.normalized * speed * Random.Range(0.5f, 1f);
                p.startColor = color;
                p.startSize = size * Random.Range(0.7f, 1.3f);
                p.startLifetime = life * Random.Range(0.7f, 1.2f);
                system.Emit(p, 1);
            }
        }

        public void Dust(Vector3 at, int direction) => Burst(at, new Color(0.9f, 0.85f, 0.75f, 0.7f), 1, 0.6f, 0.14f, 0.35f, 1f);
        public void Trail(Vector3 at) => Burst(at, new Color(0.45f, 1f, 1f, 0.55f), 1, 0.15f, 0.26f, 0.25f, 0f);
    }

    // Side-on follow camera (port of src/game/camera.ts): look-ahead in the running direction, a subtle
    // zoom-out at speed, and a view that rests on the floor so jumps do not lift it. Perspective gives depth.
    public class CameraRig
    {
        const float MinLead = 60, MaxLeadRatio = 0.24f, LeadResponse = 2.4f, SpeedZoomMin = 0.92f, ZoomResponse = 1.6f;
        // Visible height at the track plane, in px (the web view shows ~1.3 px per CSS px, 400–600).
        const float ViewHeightPx = 540, FloorFromBottom = 0.22f, Pitch = 5;

        public readonly Camera camera;
        float lead = MinLead, zoom = 1, direction = 1, shake, focusY;

        public CameraRig(Camera camera) { this.camera = camera; camera.fieldOfView = 30; }

        public float ViewHeight => ViewHeightPx / zoom;
        public float ViewWidth => ViewHeight * camera.aspect;

        public void Shake(float amount) => shake = Mathf.Max(shake, amount);

        // Track-plane rectangle in px, for "is this enemy on screen".
        public Rect2 Visible(float centerX) => new Rect2(centerX + lead - ViewWidth / 2, focusY - ViewHeight / 2, centerX + lead + ViewWidth / 2, focusY + ViewHeight / 2);
        public float CenterX { get; private set; }

        public void Update(float dt, float x, float y, float vx, int facing, bool snap = false)
        {
            float speed = Mathf.Abs(vx);
            if (speed > 60) direction = Mathf.Sign(vx); else if (speed < 5) direction = facing;
            float intensity = Mathf.Clamp01((speed - 100) / (Tuning.BoostSpeed - 100));
            float goal = direction * (MinLead + (ViewWidth * MaxLeadRatio - MinLead) * intensity);
            lead = snap ? direction * MinLead : lead + (goal - lead) * (1 - Mathf.Exp(-dt * LeadResponse));
            float zoomGoal = 1 - (1 - SpeedZoomMin) * Mathf.Clamp01((speed - Tuning.RunSpeed) / (Tuning.BoostSpeed - Tuning.RunSpeed));
            zoom += (zoomGoal - zoom) * (1 - Mathf.Exp(-dt * ZoomResponse));
            // Rest on the floor; leave it only to keep a jumping robot inside the view.
            float rest = Tuning.FloorTop - ViewHeight * (0.5f - FloorFromBottom);
            // Follow a jump up, but never a fall below the floor.
            float target = Mathf.Min(Mathf.Clamp(rest, y - ViewHeight * 0.3f, y + ViewHeight * 0.25f), rest + 40);
            focusY = snap ? target : focusY + (target - focusY) * (1 - Mathf.Exp(-dt * 8));
            CenterX = x;
            float distance = ViewHeight / 100f / 2 / Mathf.Tan(camera.fieldOfView * 0.5f * Mathf.Deg2Rad);
            var look = Tuning.ToWorld(x + lead, focusY);
            shake = Mathf.MoveTowards(shake, 0, dt * 0.6f);
            var jitter = shake > 0 ? (Vector3)(Random.insideUnitCircle * shake) : Vector3.zero;
            var rotation = Quaternion.Euler(Pitch, 0, 0);
            camera.transform.SetPositionAndRotation(look - rotation * Vector3.forward * distance + jitter, rotation);
        }
    }
}
