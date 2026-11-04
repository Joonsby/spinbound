using UnityEngine;

namespace Spinbound
{
    // Draws the robot: the Quaternius model with its skinned clips (Idle, Walking, Running, Jump, Punch, Death, No)
    // and a spinning shell while rolling. Reads the simulation, never changes it.
    public class PlayerView : MonoBehaviour
    {
        const float ModelHeight = 0.9f;
        // Yaw that turns the model's forward (+Z) toward +X, plus a little toward the camera.
        const float FacingYaw = 90, TowardCamera = 22;

        Animator animator;
        Transform model, pivot, shell;
        Renderer[] renderers;
        string state = "";
        float yaw = FacingYaw + TowardCamera, spin, punchUntil, landSquash;
        Vector3 modelScale;

        public static PlayerView Create()
        {
            var view = new GameObject("Robot").AddComponent<PlayerView>();
            view.Build();
            return view;
        }

        void Build()
        {
            pivot = new GameObject("Pivot").transform;
            pivot.SetParent(transform, false);
            var prefab = Resources.Load<GameObject>("Robot");
            model = Instantiate(prefab, pivot).transform;
            model.name = "Model";
            animator = model.GetComponentInChildren<Animator>() ?? model.gameObject.AddComponent<Animator>();
            animator.runtimeAnimatorController = Resources.Load<RuntimeAnimatorController>("RobotAnimator");
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            renderers = model.GetComponentsInChildren<Renderer>();
            // Normalise the model to the robot's on-screen size, feet on the pivot.
            var bounds = new Bounds(model.position, Vector3.zero);
            foreach (var r in renderers) bounds.Encapsulate(r.bounds);
            float scale = ModelHeight / Mathf.Max(0.01f, bounds.size.y);
            model.localScale *= scale;
            model.localPosition = new Vector3(0, -(bounds.min.y - model.position.y) * scale, 0);
            modelScale = model.localScale;
            foreach (var r in renderers) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            shell = Art.Shape(PrimitiveType.Sphere, transform, new Vector3(0, 0.3f, 0), Vector3.one * 0.62f, Art.Glow(new Color(0.36f, 0.95f, 1f, 0.33f)), false).transform;
            shell.gameObject.SetActive(false);
            Play("Idle", 0);
        }

        void Play(string next, float fade = 0.12f)
        {
            if (state == next) return;
            state = next;
            animator.CrossFadeInFixedTime(next, fade);
        }

        public void Punch() { punchUntil = Time.time + 0.32f; state = ""; Play("Punch", 0.04f); }
        public void Land(float strength) => landSquash = Mathf.Max(landSquash, Mathf.Clamp01(strength));

        // feet: world position of the body bottom centre.
        public void Render(PlayerSim p, Vector3 feet, double now, bool finished)
        {
            transform.position = feet;
            float speed = Mathf.Abs(p.body.vx);
            bool grounded = p.IsGrounded(now);
            bool rolling = p.rolling && !p.dead;
            int facing = speed > 8 && !finished ? (int)Mathf.Sign(p.body.vx) : p.facing;
            float target = facing > 0 ? FacingYaw + TowardCamera : -FacingYaw - TowardCamera;
            yaw = Mathf.MoveTowardsAngle(yaw, target, 900 * Time.deltaTime);

            shell.gameObject.SetActive(rolling);
            if (rolling)
            {
                // Curl up inside a spinning shell; the spin follows the distance rolled.
                spin -= p.body.vx / 100f / 0.3f * Mathf.Rad2Deg * Time.deltaTime;
                pivot.localRotation = Quaternion.Euler(0, 0, spin) * Quaternion.Euler(0, yaw, 0);
                pivot.localPosition = new Vector3(0, 0.3f, 0);
                model.localScale = modelScale * 0.55f;
                model.localPosition = new Vector3(0, -0.2f, 0);
                shell.localRotation = Quaternion.Euler(0, 0, spin);
                if (Time.time > punchUntil) Play("Jump", 0.05f);
            }
            else
            {
                spin = 0;
                pivot.localRotation = Quaternion.Euler(0, yaw, 0);
                pivot.localPosition = Vector3.zero;
                landSquash = Mathf.MoveTowards(landSquash, 0, Time.deltaTime * 5);
                model.localScale = Vector3.Scale(modelScale, new Vector3(1 + landSquash * 0.18f, 1 - landSquash * 0.2f, 1 + landSquash * 0.18f));
                model.localPosition = Vector3.zero;
                if (p.dead) Play("Death", 0.08f);
                else if (Time.time < punchUntil) { }
                else if (p.IsHurt(now)) Play("No", 0.05f);
                else if (!grounded) Play("Jump", 0.1f);
                else if (speed > 150) Play("Running");
                else if (speed > 8) Play("Walking");
                else Play("Idle", 0.18f);
            }
            animator.speed = state == "Running" ? Mathf.Clamp(speed / Tuning.RunSpeed, 0.8f, 1.5f) : state == "Walking" ? Mathf.Clamp(speed / 120f, 0.7f, 1.3f) : 1;
            // Blink while invulnerable, like the web robot.
            bool visible = finished || p.dead || !p.IsInvulnerable(now) || Mathf.FloorToInt((float)(now / 80)) % 2 == 0;
            foreach (var r in renderers) r.enabled = visible;
        }
    }
}
