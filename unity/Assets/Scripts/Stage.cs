using System.Collections.Generic;
using UnityEngine;

namespace Spinbound
{
    // The test stage in the web game's pixel space, modelled on stage 1's opening: a booster roll through
    // three walkers, a pit, a lone dash target, crates to climb and a last booster run to the flag.
    public class Stage
    {
        public const float Width = 3600;
        public readonly List<Rect2> solids = new();
        public readonly List<(float x, float min, float max)> enemies = new()
        {
            (650, 600, 720), (870, 820, 940), (1090, 1040, 1160),
            (2000, 1960, 2040), (2250, 2200, 2300),
            (2950, 2900, 3010), (3130, 3080, 3190), (3310, 3260, 3360),
        };
        public readonly float[] boosters = { 330, 2760 };
        public readonly float checkpointX = 1300;
        public readonly float goalX = 3480;
        public readonly Vector2 start = new(90, 440);

        public Stage()
        {
            solids.Add(new Rect2(0, 480, 1500, 600));
            solids.Add(new Rect2(1650, 480, Width, 600));
            // Crate steps.
            solids.Add(new Rect2(2420, 400, 2500, 480));
            solids.Add(new Rect2(2500, 330, 2580, 480));
        }

        // Ground, crates, scenery and lights; returns the root.
        public Transform Build()
        {
            var root = new GameObject("Stage").transform;
            var dirt = Art.Lit(new Color(0.47f, 0.31f, 0.2f), 0.05f);
            var grass = Art.Lit(new Color(0.36f, 0.72f, 0.3f), 0.2f);
            var crate = Art.Lit(new Color(0.78f, 0.55f, 0.3f), 0.15f);
            foreach (var s in solids)
            {
                bool ground = s.bottom >= 600;
                float w = (s.right - s.left) / 100, h = (s.bottom - s.top) / 100;
                var center = Tuning.ToWorld((s.left + s.right) / 2, (s.top + s.bottom) / 2);
                if (ground)
                {
                    // Deep enough that the camera never looks under it.
                    Art.Shape(PrimitiveType.Cube, root, center + new Vector3(0, -1.5f, 0.4f), new Vector3(w, h + 3, 3.4f), dirt);
                    Art.Shape(PrimitiveType.Cube, root, Tuning.ToWorld((s.left + s.right) / 2, s.top + 4, 0.4f), new Vector3(w + 0.04f, 0.1f, 3.44f), grass);
                    for (float x = s.left + 60; x < s.right - 40; x += 140 + (x * 7 % 60))
                        Art.Shape(PrimitiveType.Sphere, root, Tuning.ToWorld(x, s.top - 4, -1.15f), new Vector3(0.22f, 0.12f, 0.18f), grass, false);
                }
                else Art.Shape(PrimitiveType.Cube, root, center, new Vector3(w, h, 0.9f), crate);
            }
            Scenery(root);
            return root;
        }

        void Scenery(Transform root)
        {
            var trunk = Art.Lit(new Color(0.45f, 0.3f, 0.2f));
            var leaves = Art.Lit(new Color(0.24f, 0.6f, 0.3f), 0.25f);
            var leavesFar = Art.Lit(new Color(0.42f, 0.72f, 0.5f));
            var hill = Art.Lit(new Color(0.46f, 0.76f, 0.42f));
            var hillFar = Art.Lit(new Color(0.62f, 0.82f, 0.7f));
            var rock = Art.Lit(new Color(0.62f, 0.6f, 0.66f), 0.3f);
            var cloud = Art.Lit(new Color(1f, 1f, 1f), 0.1f);
            var rng = new System.Random(7);
            float R(float a, float b) => a + (float)rng.NextDouble() * (b - a);
            for (float x = -400; x < Width + 900; x += R(260, 420))
            {
                // Trees behind the track.
                float z = R(2.2f, 4.5f), height = R(1.2f, 2.1f);
                var basePos = new Vector3(x / 100, 0, z);
                Art.Shape(PrimitiveType.Cylinder, root, basePos + new Vector3(0, height * 0.35f, 0), new Vector3(0.18f, height * 0.35f, 0.18f), trunk);
                Art.Shape(PrimitiveType.Sphere, root, basePos + new Vector3(0, height * 0.8f, 0), Vector3.one * R(0.9f, 1.3f), leaves);
                if (rng.NextDouble() < 0.5) Art.Shape(PrimitiveType.Sphere, root, basePos + new Vector3(R(-0.4f, 0.4f), height * 0.95f, 0.2f), Vector3.one * R(0.6f, 0.9f), leaves);
                if (rng.NextDouble() < 0.35) Art.Shape(PrimitiveType.Sphere, root, new Vector3(x / 100 + 1.2f, 0.1f, R(1.4f, 2f)), new Vector3(0.5f, 0.35f, 0.4f), rock);
            }
            for (float x = -600; x < Width + 1500; x += R(500, 800))
            {
                Art.Shape(PrimitiveType.Sphere, root, new Vector3(x / 100, -1.2f, R(9, 12)), new Vector3(R(7, 10), R(4, 6), 4), hill, false);
                Art.Shape(PrimitiveType.Sphere, root, new Vector3(x / 100 + 3, -2f, R(20, 26)), new Vector3(R(12, 16), R(9, 13), 4), hillFar, false);
                Art.Shape(PrimitiveType.Sphere, root, new Vector3(x / 100 + 1, 0.6f, R(6, 8)), Vector3.one * R(1.2f, 1.8f), leavesFar, false);
            }
            for (float x = -500; x < Width + 1500; x += R(700, 1100))
            {
                var c = new Vector3(x / 100, R(4.2f, 6f), R(14, 20));
                for (int i = 0; i < 4; i++) Art.Shape(PrimitiveType.Sphere, root, c + new Vector3(i * 0.7f - 1, Mathf.Sin(i * 1.7f) * 0.3f, 0), Vector3.one * R(1f, 1.6f), cloud, false);
            }
            // Sky backdrop far behind everything.
            var sky = Art.Shape(PrimitiveType.Quad, root, new Vector3(Width / 200, 6, 60), new Vector3(400, 60, 1),
                Art.Glow(Color.white, Art.Gradient(new Color(0.33f, 0.62f, 0.95f), new Color(0.85f, 0.94f, 1f))), false);
            sky.GetComponent<MeshRenderer>().receiveShadows = false;
        }
    }
}
