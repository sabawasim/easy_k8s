/**
 * Example usage of the K8sPipelineGenerator library
 */

const K8sPipelineGenerator = require('./k8s-pipeline-generator');
const fs = require('fs');
const path = require('path');

// Create a new generator instance
const generator = new K8sPipelineGenerator({
  projectName: 'my-nodejs-app',
  repoUrl: 'https://github.com/myorg/my-nodejs-app',
  branch: 'main',
  namespace: 'production',
  dockerRegistry: 'myorg',
  dockerfilePath: './Dockerfile',
  registry: {
    aws: {
      region: 'us-west-2',
      accountId: '123456789012',
      ecrRepository: 'my-nodejs-app'
    }
  }
});

// Add pipeline stages
generator
  .addTestStage('npm test', 'node:16')
  .addBuildStage('npm ci && npm run build', 'node:16')
  .addDockerBuildStage('my-nodejs-app', '${GIT_COMMIT:0:7}')
  .addDeployStage('dev')
  .addDeployStage('staging')
  .addDeployStage('prod');

// Generate and save all pipeline files
const outputFiles = generator.saveToFiles('./output');
console.log('Generated pipeline files:', outputFiles);

// You can also generate individual files
const jenkinsfile = generator.generateJenkinsfile();
console.log('Jenkinsfile generated successfully!');

const awsTemplate = generator.generateAwsCodePipeline();
console.log('AWS CodePipeline template generated successfully!');

// Generate Kubernetes manifests for a custom application
const deployment = generator.generateK8sDeployment('custom-app', 'v1.0.0', { 
  cpu: '200m', 
  memory: '256Mi' 
});
console.log('Custom K8s deployment generated!');

const service = generator.generateK8sService(8080, 3000, 'LoadBalancer');
console.log('Custom K8s service generated!');
