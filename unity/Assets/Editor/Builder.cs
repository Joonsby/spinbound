using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Spinbound.EditorTools
{
    // Rebuilds everything the prototype needs from source, so nothing depends on hand edits in the editor:
    // robot import settings and animator, base materials, the scene, WebGL settings, and the WebGL build.
    // Batch: Unity -batchmode -quit -projectPath unity -buildTarget WebGL -executeMethod Spinbound.EditorTools.Builder.All
    public static class Builder
    {
        const string RobotPath = "Assets/Resources/Robot.fbx";
        const string ControllerPath = "Assets/Resources/RobotAnimator.controller";
        const string ScenePath = "Assets/Scenes/Prototype.unity";
        static readonly string[] Looping = { "Idle", "Running", "Walking" };

        [MenuItem("Spinbound/Set Up Project")]
        public static void SetUp()
        {
            ImportRobot();
            BuildAnimator();
            BuildMaterials();
            SaveMeshes();
            BuildScene();
            WebGlSettings();
            AssetDatabase.SaveAssets();
            Debug.Log("[Spinbound] set up done");
        }

        [MenuItem("Spinbound/Build WebGL")]
        public static void BuildWebGl()
        {
            var output = Path.GetFullPath(Path.Combine(Application.dataPath, "../../unity-web"));
            if (Directory.Exists(output)) Directory.Delete(output, true);
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath }, locationPathName = output, target = BuildTarget.WebGL, options = BuildOptions.None,
            });
            Debug.Log($"[Spinbound] build {report.summary.result}: {report.summary.totalSize / 1048576f:0.0} MB in {report.summary.totalTime.TotalSeconds:0}s");
            if (Application.isBatchMode && report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
        }

        public static void All() { SetUp(); BuildWebGl(); }

        static void ImportRobot()
        {
            var importer = (ModelImporter)AssetImporter.GetAtPath(RobotPath);
            importer.animationType = ModelImporterAnimationType.Generic;
            importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            importer.importAnimation = true;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            var clips = importer.defaultClipAnimations;
            foreach (var clip in clips)
            {
                clip.name = Short(clip.takeName);
                clip.loopTime = Looping.Contains(clip.name);
            }
            importer.clipAnimations = clips;
            importer.SaveAndReimport();
        }

        static string Short(string take) { int i = take.LastIndexOf("Robot_"); return i >= 0 ? take.Substring(i + 6) : take; }

        static void BuildAnimator()
        {
            AssetDatabase.DeleteAsset(ControllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            var machine = controller.layers[0].stateMachine;
            var clips = AssetDatabase.LoadAllAssetsAtPath(RobotPath).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__"));
            foreach (var clip in clips)
            {
                var state = machine.AddState(clip.name);
                state.motion = clip;
                if (clip.name == "Idle") machine.defaultState = state;
                Debug.Log($"[Spinbound] clip {clip.name} {clip.length:0.00}s loop={clip.isLooping}");
            }
        }

        static void BuildMaterials()
        {
            if (!AssetDatabase.IsValidFolder("Assets/Resources/Materials")) AssetDatabase.CreateFolder("Assets/Resources", "Materials");
            var lit = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            lit.SetFloat("_Smoothness", 0.15f);
            Save(lit, "Assets/Resources/Materials/Lit.mat");
            var glow = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
            glow.SetFloat("_Surface", 1);
            glow.SetFloat("_Blend", 0);
            glow.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            glow.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            glow.SetFloat("_ZWrite", 0);
            glow.SetOverrideTag("RenderType", "Transparent");
            glow.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            glow.renderQueue = (int)RenderQueue.Transparent;
            Save(glow, "Assets/Resources/Materials/Glow.mat");
        }

        // Primitive meshes as assets: CreatePrimitive at runtime would add colliders, and the physics module is stripped.
        static void SaveMeshes()
        {
            if (!AssetDatabase.IsValidFolder("Assets/Resources/Meshes")) AssetDatabase.CreateFolder("Assets/Resources", "Meshes");
            foreach (var type in new[] { PrimitiveType.Cube, PrimitiveType.Sphere, PrimitiveType.Cylinder, PrimitiveType.Quad })
            {
                var go = GameObject.CreatePrimitive(type);
                var path = $"Assets/Resources/Meshes/{type}.asset";
                AssetDatabase.DeleteAsset(path);
                AssetDatabase.CreateAsset(Object.Instantiate(go.GetComponent<MeshFilter>().sharedMesh), path);
                Object.DestroyImmediate(go);
            }
        }

        static void Save(Material material, string path)
        {
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material, path);
        }

        static void BuildScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("Game").AddComponent<GameDirector>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void WebGlSettings()
        {
            PlayerSettings.companyName = "Spinbound";
            PlayerSettings.productName = "Spinbound Unity";
            PlayerSettings.WebGL.template = "PROJECT:Spinbound";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            // Plain static hosting (Vercel) without Content-Encoding headers still loads the build.
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.runInBackground = false;
            // The splash only delays play in a side-by-side comparison.
            PlayerSettings.SplashScreen.show = false;
        }
    }
}
