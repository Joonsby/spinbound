using System.Collections.Generic;
using UnityEngine;

namespace Spinbound
{
    // Runtime-made materials, textures and primitives. Base materials live in Resources/Materials (made by
    // the editor builder), so their shaders are always in the build; colours are set on copies.
    public static class Art
    {
        static Material litBase, glowBase;
        static readonly Dictionary<string, Material> cache = new();
        static Texture2D softDot;

        public static Material Lit(Color color, float smoothness = 0.15f, float metallic = 0f)
        {
            string key = $"lit{color}{smoothness}{metallic}";
            if (cache.TryGetValue(key, out var found)) return found;
            litBase ??= Resources.Load<Material>("Materials/Lit");
            var m = new Material(litBase);
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Metallic", metallic);
            return cache[key] = m;
        }

        // Unlit, alpha blended (shells, glows, particles).
        public static Material Glow(Color color, Texture texture = null)
        {
            glowBase ??= Resources.Load<Material>("Materials/Glow");
            var m = new Material(glowBase);
            m.SetColor("_BaseColor", color);
            if (texture != null) m.SetTexture("_BaseMap", texture);
            return m;
        }

        public static Texture2D SoftDot
        {
            get
            {
                if (softDot != null) return softDot;
                const int size = 64;
                softDot = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < size; y++)
                    for (int x = 0; x < size; x++)
                    {
                        float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(size / 2f, size / 2f)) / (size / 2f);
                        float a = Mathf.Clamp01(1 - d);
                        softDot.SetPixel(x, y, new Color(1, 1, 1, a * a));
                    }
                softDot.Apply();
                return softDot;
            }
        }

        // Primitive mesh without a collider (the game never uses Unity physics; the builder saves the meshes).
        public static GameObject Shape(PrimitiveType type, Transform parent, Vector3 position, Vector3 scale, Material material, bool shadows = true)
        {
            var go = new GameObject(type.ToString());
            go.AddComponent<MeshFilter>().sharedMesh = Resources.Load<Mesh>($"Meshes/{type}");
            go.AddComponent<MeshRenderer>();
            go.transform.SetParent(parent, false);
            go.transform.localPosition = position;
            go.transform.localScale = scale;
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        // Rounded rectangle for 9-sliced UI buttons.
        public static Sprite RoundedRect(int size = 64, int radius = 20)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, radius, size - radius), cy = Mathf.Clamp(y + 0.5f, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(radius - d + 0.5f)));
                }
            t.Apply();
            return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(radius, radius, radius, radius));
        }

        // Filled triangle pointing right (rotate the image for other directions).
        public static Sprite Triangle(int size = 64)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float u = (x + 0.5f) / size, v = Mathf.Abs((y + 0.5f) / size - 0.5f) * 2;
                    float inside = Mathf.Min(u - 0.12f, (0.88f - u) - v * 0.76f);
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(inside * size * 0.5f + 0.5f)));
                }
            t.Apply();
            return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
        }

        // Vertical two-colour gradient (sky backdrop).
        public static Texture2D Gradient(Color top, Color bottom)
        {
            var t = new Texture2D(2, 64, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < 64; y++) { var c = Color.Lerp(bottom, top, y / 63f); t.SetPixel(0, y, c); t.SetPixel(1, y, c); }
            t.Apply();
            return t;
        }
    }
}
