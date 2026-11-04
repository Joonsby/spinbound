import Phaser from 'phaser';
import { PHYSICS } from './config';
import { createTapState, registerRelease, registerTap, type Direction } from './movement';

export type Control = 'left' | 'right' | 'jump';
// `dash` is the direction of a double tap seen this frame (0 when none).
export type InputFrame = { direction: Direction; jumpPressed: boolean; jumpHeld: boolean; dash: Direction };

// Touch buttons and keyboard merged into one per-frame snapshot. Owned by a scene.
export class InputController {
  private pointers: Record<Control, Set<number>> = { left: new Set(), right: new Set(), jump: new Set() };
  private buttons = new Map<Control, HTMLButtonElement>();
  private jumpEdges = 0;
  // Presses and releases of a direction in the order they happened; double taps count from the release.
  private directionEdges: { direction: -1 | 1; down: boolean }[] = [];
  private taps = createTapState();
  private keys: Record<'LEFT' | 'RIGHT' | 'UP' | 'A' | 'D' | 'W' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private cleanup: (() => void)[] = [];
  private frame: InputFrame = { direction: 0, jumpPressed: false, jumpHeld: false, dash: 0 };

  constructor(private scene: Phaser.Scene) {
    document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
      const control = button.dataset.control as Control;
      if (!(control in this.pointers)) return;
      this.buttons.set(control, button);
      const down = (event: PointerEvent) => {
        event.preventDefault();
        try { button.setPointerCapture(event.pointerId); } catch { /* Pointer already released. */ }
        this.press(control, event.pointerId);
      };
      const up = (event: PointerEvent) => this.release(control, event.pointerId);
      button.addEventListener('pointerdown', down);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, up);
      this.cleanup.push(() => {
        button.removeEventListener('pointerdown', down);
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.removeEventListener(type, up);
      });
    });
    const keyboard = scene.input.keyboard!;
    this.keys = keyboard.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE') as typeof this.keys;
    // Cancel browser button activation only after Phaser has received the key.
    // Preventing it in DOM capture makes KeyboardManager discard the input.
    const preventDefault = (event: KeyboardEvent) => event.preventDefault();
    keyboard.on('keydown-SPACE', preventDefault);
    keyboard.on('keyup-SPACE', preventDefault);
    const reset = () => this.reset();
    const visibility = () => { if (document.hidden) this.reset(); };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    scene.game.events.on(Phaser.Core.Events.BLUR, reset);
    this.cleanup.push(() => {
      keyboard.off('keydown-SPACE', preventDefault);
      keyboard.off('keyup-SPACE', preventDefault);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      scene.game.events.off(Phaser.Core.Events.BLUR, reset);
    });
  }

  press(control: Control, pointerId: number) {
    if (control === 'jump' && this.pointers.jump.size === 0) this.jumpEdges += 1;
    if (control !== 'jump' && this.pointers[control].size === 0) this.directionEdges.push({ direction: control === 'left' ? -1 : 1, down: true });
    this.pointers[control].add(pointerId);
    this.buttons.get(control)?.classList.add('pressed');
  }

  release(control: Control, pointerId: number) {
    // pointerup and lostpointercapture both arrive for one lift; only the first finds the pointer.
    if (!this.pointers[control].delete(pointerId) || this.pointers[control].size) return;
    this.buttons.get(control)?.classList.remove('pressed');
    if (control !== 'jump') this.directionEdges.push({ direction: control === 'left' ? -1 : 1, down: false });
  }

  poll(now: number): InputFrame {
    const { keys } = this;
    // Evaluate every JustDown: it consumes the edge, so short-circuiting would replay it next frame.
    const up = Phaser.Input.Keyboard.JustDown(keys.UP);
    const w = Phaser.Input.Keyboard.JustDown(keys.W);
    const space = Phaser.Input.Keyboard.JustDown(keys.SPACE);
    const leftTap = [Phaser.Input.Keyboard.JustDown(keys.LEFT), Phaser.Input.Keyboard.JustDown(keys.A)].some(Boolean);
    const rightTap = [Phaser.Input.Keyboard.JustDown(keys.RIGHT), Phaser.Input.Keyboard.JustDown(keys.D)].some(Boolean);
    // A release counts only when the other key for that direction is not still held.
    const [arrowLeftUp, aUp, arrowRightUp, dUp] = [keys.LEFT, keys.A, keys.RIGHT, keys.D].map((key) => Phaser.Input.Keyboard.JustUp(key));
    const leftUp = (arrowLeftUp && !keys.A.isDown) || (aUp && !keys.LEFT.isDown);
    const rightUp = (arrowRightUp && !keys.D.isDown) || (dUp && !keys.RIGHT.isDown);
    // Released and pressed again within one frame: up first, then down.
    if (leftUp) this.directionEdges.push({ direction: -1, down: false });
    if (rightUp) this.directionEdges.push({ direction: 1, down: false });
    if (leftTap) this.directionEdges.push({ direction: -1, down: true });
    if (rightTap) this.directionEdges.push({ direction: 1, down: true });
    this.frame.dash = 0;
    for (const { direction, down } of this.directionEdges) {
      if (!down) registerRelease(this.taps, direction, now);
      else if (registerTap(PHYSICS, this.taps, direction, now)) this.frame.dash = direction;
    }
    this.directionEdges.length = 0;
    const left = keys.LEFT.isDown || keys.A.isDown || this.pointers.left.size > 0;
    const right = keys.RIGHT.isDown || keys.D.isDown || this.pointers.right.size > 0;
    this.frame.direction = (Number(right) - Number(left)) as Direction;
    this.frame.jumpPressed = up || w || space || this.jumpEdges > 0;
    this.frame.jumpHeld = keys.UP.isDown || keys.W.isDown || keys.SPACE.isDown || this.pointers.jump.size > 0;
    this.jumpEdges = 0;
    return this.frame;
  }

  reset() {
    for (const pointers of Object.values(this.pointers)) pointers.clear();
    for (const button of this.buttons.values()) button.classList.remove('pressed');
    this.jumpEdges = 0;
    this.directionEdges.length = 0;
    this.taps = createTapState();
    this.scene.input.keyboard?.resetKeys();
  }

  destroy() {
    this.reset();
    this.cleanup.forEach((dispose) => dispose());
    this.cleanup = [];
  }
}
