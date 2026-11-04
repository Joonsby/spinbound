using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace Spinbound
{
    public enum Control { Left, Right, Jump }

    // Touch buttons and keyboard merged into one snapshot per simulation step (port of src/game/input.ts).
    // Presses and releases keep their own times, so a slow frame never stretches or squeezes a double tap.
    public class GameInput
    {
        struct Edge { public int direction; public bool down; public double at; }

        readonly Dictionary<Control, HashSet<int>> pointers = new()
        {
            { Control.Left, new HashSet<int>() }, { Control.Right, new HashSet<int>() }, { Control.Jump, new HashSet<int>() },
        };
        readonly List<Edge> edges = new();
        TapState taps = new TapState();
        int jumpEdges;
        public System.Action<Control, bool> onVisual;

        public static double Clock => Time.realtimeSinceStartupAsDouble * 1000.0;

        public void Press(Control control, int pointerId, double at)
        {
            if (control == Control.Jump && pointers[Control.Jump].Count == 0) jumpEdges++;
            if (control != Control.Jump && pointers[control].Count == 0) edges.Add(new Edge { direction = control == Control.Left ? -1 : 1, down = true, at = at });
            pointers[control].Add(pointerId);
            onVisual?.Invoke(control, true);
        }

        public void Release(Control control, int pointerId, double at)
        {
            if (!pointers[control].Remove(pointerId) || pointers[control].Count > 0) return;
            onVisual?.Invoke(control, false);
            if (control != Control.Jump) edges.Add(new Edge { direction = control == Control.Left ? -1 : 1, down = false, at = at });
        }

        // Keyboard: arrows / A D for moving, Space / Up / W for jumping. Read every rendered frame.
        public void ReadKeyboard()
        {
            var k = Keyboard.current;
            if (k == null) return;
            double at = Clock;
            Key(k.leftArrowKey, Control.Left, -10, at); Key(k.aKey, Control.Left, -11, at);
            Key(k.rightArrowKey, Control.Right, -12, at); Key(k.dKey, Control.Right, -13, at);
            Key(k.spaceKey, Control.Jump, -14, at); Key(k.upArrowKey, Control.Jump, -15, at); Key(k.wKey, Control.Jump, -16, at);
        }

        void Key(UnityEngine.InputSystem.Controls.KeyControl key, Control control, int id, double at)
        {
            if (key.wasPressedThisFrame) Press(control, id, at);
            if (key.wasReleasedThisFrame) Release(control, id, at);
        }

        public InputFrame Poll()
        {
            var frame = new InputFrame();
            edges.Sort((a, b) => a.at.CompareTo(b.at));
            foreach (var e in edges)
            {
                if (!e.down) Movement.RegisterRelease(taps, e.direction, e.at);
                else if (Movement.RegisterTap(taps, e.direction, e.at)) frame.dash = e.direction;
            }
            edges.Clear();
            bool left = pointers[Control.Left].Count > 0, right = pointers[Control.Right].Count > 0;
            frame.direction = (right ? 1 : 0) - (left ? 1 : 0);
            frame.jumpPressed = jumpEdges > 0;
            frame.jumpHeld = pointers[Control.Jump].Count > 0;
            jumpEdges = 0;
            return frame;
        }

        public void Reset()
        {
            foreach (var pair in pointers) { pair.Value.Clear(); onVisual?.Invoke(pair.Key, false); }
            edges.Clear();
            jumpEdges = 0;
            taps = new TapState();
        }
    }

    // A pad button: each finger is tracked by its pointer id, and the finger that pressed keeps the button
    // until it lifts, even if it slides off (like pointer capture on the web pad).
    public class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public Control control;
        public GameInput input;
        public void OnPointerDown(PointerEventData e) => input?.Press(control, e.pointerId, GameInput.Clock);
        public void OnPointerUp(PointerEventData e) => input?.Release(control, e.pointerId, GameInput.Clock);
    }
}
