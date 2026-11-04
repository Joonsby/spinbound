using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace Spinbound
{
    // Screen UI built in code: the touch pad (inside the safe area), HP, status line, timer, FPS and the
    // clear card. English text only: the built-in font has no Hangul.
    public class Hud : MonoBehaviour
    {
        static readonly Color PadFace = new(0.11f, 0.16f, 0.27f, 0.42f), PadPressed = new(1, 1, 1, 0.38f);
        static readonly Color JumpFace = new(1f, 0.6f, 0.18f, 0.55f);

        RectTransform safe;
        Text status, timer, fps, popupTemplate;
        Image[] hearts;
        GameObject clearCard;
        Text clearText;
        readonly Dictionary<Control, Image> pads = new();
        readonly List<(Text text, Vector3 world, float born)> popups = new();
        Font font;
        float fpsTime; int fpsFrames;
        Rect lastSafe;
        public System.Action onRetry, onToggleFx;
        public double loadMs = -1;

        public static Hud Create(GameInput input)
        {
            var hud = new GameObject("Hud").AddComponent<Hud>();
            hud.Build(input);
            return hud;
        }

        void Build(GameInput input)
        {
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var canvas = gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(932, 430);
            scaler.matchWidthOrHeight = 1;
            gameObject.AddComponent<GraphicRaycaster>();
            if (FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                DontDestroyOnLoad(es);
            }
            safe = Panel(transform as RectTransform, "Safe");
            ApplySafeArea();

            var round = Art.RoundedRect();
            var tri = Art.Triangle();
            // Pad: two direction buttons bottom-left, jump bottom-right (sizes from the web pad).
            Pad(Control.Left, input, round, tri, new Vector2(4, 4), new Vector2(90, 76), 180, PadFace);
            Pad(Control.Right, input, round, tri, new Vector2(102, 4), new Vector2(90, 76), 0, PadFace);
            Pad(Control.Jump, input, round, tri, new Vector2(-4, 4), new Vector2(132, 76), 90, JumpFace, true);
            input.onVisual = (control, down) => { if (pads.TryGetValue(control, out var img)) img.color = down ? PadPressed : control == Control.Jump ? JumpFace : PadFace; };

            hearts = new Image[3];
            for (int i = 0; i < 3; i++)
            {
                hearts[i] = Img(safe, round, new Color(1f, 0.42f, 0.42f), new Vector2(0, 1), new Vector2(10 + i * 26, -10), new Vector2(22, 22));
            }
            status = Label(safe, "", 15, TextAnchor.UpperCenter, new Vector2(0.5f, 1), new Vector2(0, -10), new Vector2(560, 28));
            timer = Label(safe, "0.0s", 16, TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(92, -12), new Vector2(120, 24));
            fps = Label(safe, "", 12, TextAnchor.UpperRight, new Vector2(1, 1), new Vector2(-62, -10), new Vector2(220, 40));
            var fxButton = Img(safe, round, new Color(0.11f, 0.16f, 0.27f, 0.6f), new Vector2(1, 1), new Vector2(-8, -8), new Vector2(48, 30));
            Label(fxButton.rectTransform, "FX", 14, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(48, 30));
            fxButton.gameObject.AddComponent<Button>().onClick.AddListener(() => onToggleFx?.Invoke());
            popupTemplate = Label(transform as RectTransform, "", 26, TextAnchor.MiddleCenter, new Vector2(0, 0), Vector2.zero, new Vector2(300, 40));
            popupTemplate.gameObject.SetActive(false);

            clearCard = Img(transform as RectTransform, round, new Color(0.07f, 0.1f, 0.2f, 0.88f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(360, 190)).gameObject;
            clearText = Label(clearCard.transform as RectTransform, "", 22, TextAnchor.UpperCenter, new Vector2(0.5f, 1), new Vector2(0, -22), new Vector2(340, 110));
            var retry = Img(clearCard.transform as RectTransform, round, new Color(1f, 0.6f, 0.18f), new Vector2(0.5f, 0), new Vector2(0, 18), new Vector2(180, 48));
            Label(retry.rectTransform, "RETRY", 20, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(180, 48));
            retry.gameObject.AddComponent<Button>().onClick.AddListener(() => onRetry?.Invoke());
            clearCard.SetActive(false);
        }

        void Pad(Control control, GameInput input, Sprite round, Sprite tri, Vector2 offset, Vector2 size, float angle, Color face, bool right = false)
        {
            var anchor = right ? new Vector2(1, 0) : new Vector2(0, 0);
            var img = Img(safe, round, face, anchor, offset, size);
            img.rectTransform.pivot = anchor;
            var icon = Img(img.rectTransform, tri, new Color(1, 1, 1, 0.92f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(34, 34));
            icon.rectTransform.localRotation = Quaternion.Euler(0, 0, angle);
            icon.raycastTarget = false;
            var button = img.gameObject.AddComponent<TouchButton>();
            button.control = control; button.input = input;
            pads[control] = img;
        }

        RectTransform Panel(RectTransform parent, string name)
        {
            var rt = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = rt.offsetMax = Vector2.zero;
            return rt;
        }

        Image Img(RectTransform parent, Sprite sprite, Color color, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var img = new GameObject("Image", typeof(RectTransform), typeof(Image)).GetComponent<Image>();
            img.rectTransform.SetParent(parent, false);
            img.sprite = sprite; img.type = Image.Type.Sliced; img.color = color;
            img.rectTransform.anchorMin = img.rectTransform.anchorMax = img.rectTransform.pivot = anchor;
            img.rectTransform.anchoredPosition = position; img.rectTransform.sizeDelta = size;
            return img;
        }

        Text Label(RectTransform parent, string text, int size, TextAnchor align, Vector2 anchor, Vector2 position, Vector2 box)
        {
            var t = new GameObject("Text", typeof(RectTransform), typeof(Text), typeof(Outline)).GetComponent<Text>();
            t.rectTransform.SetParent(parent, false);
            t.font = font; t.fontSize = size; t.fontStyle = FontStyle.Bold; t.alignment = align; t.color = Color.white; t.text = text;
            t.raycastTarget = false;
            t.GetComponent<Outline>().effectColor = new Color(0.08f, 0.1f, 0.18f, 0.9f);
            t.rectTransform.anchorMin = t.rectTransform.anchorMax = t.rectTransform.pivot = anchor;
            t.rectTransform.anchoredPosition = position; t.rectTransform.sizeDelta = box;
            return t;
        }

        void ApplySafeArea()
        {
            var area = Screen.safeArea;
            lastSafe = area;
            var size = new Vector2(Screen.width, Screen.height);
            if (size.x <= 0 || size.y <= 0) return;
            safe.anchorMin = new Vector2(area.xMin / size.x, area.yMin / size.y);
            safe.anchorMax = new Vector2(area.xMax / size.x, area.yMax / size.y);
            // Keep a small gap from the screen edge even without insets, like the web pad (2 px).
            safe.offsetMin = new Vector2(2, 2); safe.offsetMax = new Vector2(-2, -2);
        }

        public void SetHp(int hp) { for (int i = 0; i < hearts.Length; i++) hearts[i].color = i < hp ? new Color(1f, 0.42f, 0.42f) : new Color(1, 1, 1, 0.18f); }
        public void SetStatus(string text) => status.text = text;
        public void SetTimer(double seconds) => timer.text = $"{seconds:0.0}s";

        public void ShowClear(double seconds, int kills, int bestCombo)
        {
            clearCard.SetActive(true);
            clearText.text = $"STAGE CLEAR!\n{seconds:0.0}s  ·  {kills} KO  ·  best combo {bestCombo}";
        }

        public void HideClear() => clearCard.SetActive(false);

        public void Popup(string text, Vector3 world, Color color)
        {
            var t = Instantiate(popupTemplate, transform);
            t.gameObject.SetActive(true);
            t.text = text; t.color = color;
            popups.Add((t, world, Time.time));
        }

        void Update()
        {
            if (Screen.safeArea != lastSafe) ApplySafeArea();
            fpsFrames++; fpsTime += Time.unscaledDeltaTime;
            if (fpsTime >= 0.5f)
            {
                fps.text = $"{fpsFrames / fpsTime:0} FPS  {fpsTime / fpsFrames * 1000:0.0}ms" + (loadMs >= 0 ? $"\nload {loadMs / 1000:0.0}s" : "");
                fpsFrames = 0; fpsTime = 0;
            }
            var cam = Camera.main;
            var rect = transform as RectTransform;
            for (int i = popups.Count - 1; i >= 0; i--)
            {
                var (text, world, born) = popups[i];
                float age = Time.time - born;
                if (age > 0.8f || cam == null) { Destroy(text.gameObject); popups.RemoveAt(i); continue; }
                var screen = cam.WorldToScreenPoint(world + Vector3.up * age * 0.6f);
                RectTransformUtility.ScreenPointToLocalPointInRectangle(rect, screen, null, out var local);
                text.rectTransform.anchoredPosition = local + rect.rect.size * 0.5f;
                var c = text.color; c.a = 1 - Mathf.Clamp01((age - 0.5f) / 0.3f); text.color = c;
                text.transform.localScale = Vector3.one * (age < 0.1f ? 0.6f + age * 4 : 1);
            }
        }
    }
}
