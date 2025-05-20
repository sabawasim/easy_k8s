# K8s Pipeline Generator

A flexible Node.js library for generating Kubernetes pipeline configurations for both Jenkins and AWS CodePipeline.

## Features

- Generate complete pipeline configurations with a single API
- Support for both Jenkins and AWS CodePipeline
- Built-in stages for testing, building, and deploying Kubernetes applications
- Generate Kubernetes manifests (deployments, services)
- Customizable for different environments (dev, staging, prod)
- Easy extension with custom stages

## Installation

```bash
npm install k8s-pipeline-generator
```

Required dependencies:
```bash
npm install js-yaml uuid
```

## Quick Start

```javascript
const K8sPipelineGenerator = require('k8s-pipeline-generator');

// Create a generator instance
const generator = new K8sPipelineGenerator({
  projectName: 'my-node-app',
  repoUrl: 'https://github.com/myorg/my-node-app',
  namespace: 'production',
  dockerRegistry: 'myorg'
});

// Configure your pipeline
generator
  .addTestStage('npm test')
  .addBuildStage('npm ci && npm run build')
  .addDockerBuildStage('my-node-app')
  .addDeployStage('dev')
  .addDeployStage('prod');

// Generate and save all pipeline files
generator.saveToFiles('./pipeline-config');
```

## API Reference

### Constructor Options

```javascript
const generator = new K8sPipelineGenerator({
  projectName: 'my-app',            // Project name
  repoUrl: 'https://github.com/...', // Git repository URL
  branch: 'main',                   // Git branch (default: main)
  namespace: 'default',             // Kubernetes namespace
  dockerRegistry: 'mycompany',      // Docker registry URL/prefix
  dockerfilePath: './Dockerfile',   // Path to Dockerfile
  registry: {                       // Registry configuration
    aws: {
      region: 'us-east-1',
      accountId: '123456789012',
      ecrRepository: 'my-app-repo'
    }
  }
});
```

### Methods

#### Adding Pipeline Stages

```javascript
// Add a generic stage
generator.addStage({
  name: 'custom-stage',
  steps: [
    {
      name: 'custom-step',
      image: 'alpine:latest',
      command: ['sh', '-c', 'echo "Custom step running"']
    }
  ]
});

// Add a test stage
generator.addTestStage('npm test', 'node:16');

// Add a build stage
generator.addBuildStage('npm run build', 'node:16');

// Add a Docker build stage
generator.addDockerBuildStage('image-name', 'tag');

// Add a deployment stage
generator.addDeployStage('dev');
```

#### Generating Pipeline Configurations

```javascript
// Generate Jenkins pipeline
const jenkinsfile = generator.generateJenkinsfile();

// Generate AWS CodePipeline
const awsCodePipeline = generator.generateAwsCodePipeline();

// Generate Kubernetes deployment
const deployment = generator.generateK8sDeployment(
  'my-app', 
  'latest',
  { cpu: '100m', memory: '128Mi' }
);

// Generate Kubernetes service
const service = generator.generateK8sService(80, 8080, 'LoadBalancer');

// Save all files to disk
const outputFiles = generator.saveToFiles('./output-dir');
```

## File Structure

When saving files with `saveToFiles()`, the following structure is created:

```
output-dir/
├── Jenkinsfile
├── aws-codepipeline.yaml
├── buildspec.yml
├── deploy-buildspec.yml
└── k8s/
    ├── dev/
    │   ├── deployment.yaml
    │   └── service.yaml
    ├── staging/
    │   ├── deployment.yaml
    │   └── service.yaml
    └── prod/
        ├── deployment.yaml
        └── service.yaml
```

## Examples

### Complete Jenkins Pipeline Example

```javascript
const generator = new K8sPipelineGenerator({
  projectName: 'backend-api',
  repoUrl: 'https://github.com/company/backend-api',
  namespace: 'backend'
});

generator
  .addTestStage('npm test && npm run lint')
  .addBuildStage('npm ci && npm run build')
  .addDockerBuildStage('backend-api', '${GIT_COMMIT}')
  .addDeployStage('dev')
  .addStage({
    name: 'integration-tests',
    steps: [
      {
        name: 'run-integration-tests',
        image: 'node:16',
        command: ['sh', '-c', 'npm run test:integration']
      }
    ]
  })
  .addDeployStage('prod');

const jenkinsfile = generator.generateJenkinsfile();
```

### AWS CodePipeline Example

```javascript
const generator = new K8sPipelineGenerator({
  projectName: 'frontend-app',
  repoUrl: 'https://github.com/company/frontend-app',
  namespace: 'frontend',
  registry: {
    aws: {
      region: 'us-west-2',
      accountId: '123456789012',
      ecrRepository: 'frontend-app'
    }
  }
});

generator
  .addTestStage('npm test')
  .addBuildStage('npm ci && npm run build')
  .addDockerBuildStage('frontend-app')
  .addDeployStage('dev');

const awsPipeline = generator.generateAwsCodePipeline();
```

### Custom Kubernetes Resources

```javascript
const generator = new K8sPipelineGenerator({
  projectName: 'microservice',
  namespace: 'services'
});

// Generate deployment with custom resources
const deployment = generator.generateK8sDeployment(
  'microservice', 
  'v1.2.3',
  {
    cpu: '200m',
    memory: '256Mi',
    limits: {
      cpu: '500m',
      memory: '512Mi'
    }
  }
);

// Generate LoadBalancer service
const service = generator.generateK8sService(80, 8080, 'LoadBalancer');
```

## Extending the Library

You can extend the library to support additional CI/CD platforms or customize the generated artifacts:

```javascript
class ExtendedGenerator extends K8sPipelineGenerator {
  generateCircleCIConfig() {
    // Generate CircleCI configuration
    return {
      version: 2.1,
      jobs: {
        // Custom CircleCI jobs...
      },
      workflows: {
        // Custom workflows...
      }
    };
  }
  
  addCustomStage(stageName, customCommands) {
    this.addStage({
      name: stageName,
      steps: [
        {
          name: `execute-${stageName}`,
          image: 'alpine',
          command: ['sh', '-c', customCommands]
        }
      ]
    });
    return this;
  }
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
