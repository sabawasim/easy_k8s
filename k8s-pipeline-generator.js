/**
 * k8s-pipeline-generator
 * A Node.js library to generate Kubernetes pipeline configurations for Jenkins and AWS CodePipeline
 * 
 * @author Saba Wasim
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');

/**
 * Main class for generating pipeline configurations
 */
class K8sPipelineGenerator {
  /**
   * Create a new pipeline generator
   * @param {Object} options - Configuration options
   * @param {string} options.projectName - Name of the project
   * @param {string} options.repoUrl - Git repository URL
   * @param {string} options.branch - Git branch to use (default: main)
   * @param {string} options.namespace - Kubernetes namespace (default: default)
   * @param {string} options.dockerRegistry - Docker registry URL
   * @param {Object} options.deploymentConfig - Kubernetes deployment configuration
   */
  constructor(options = {}) {
    this.projectName = options.projectName || 'k8s-app';
    this.repoUrl = options.repoUrl || '';
    this.branch = options.branch || 'main';
    this.namespace = options.namespace || 'default';
    this.dockerRegistry = options.dockerRegistry || '';
    this.deploymentConfig = options.deploymentConfig || {};
    this.stages = [];
    this.environments = ['dev', 'staging', 'prod'];
    this.dockerfilePath = options.dockerfilePath || './Dockerfile';
    this.registry = options.registry || {
      aws: {
        region: 'us-east-1',
        accountId: '123456789012',
        ecrRepository: `${this.projectName}-repo`
      }
    };
  }

  /**
   * Add a custom stage to the pipeline
   * @param {Object} stage - Stage configuration
   * @param {string} stage.name - Stage name
   * @param {Array} stage.steps - Array of steps for this stage
   * @param {string} stage.runAfter - Stage to run after (optional)
   * @param {boolean} stage.parallel - Whether to run in parallel (optional)
   * @returns {K8sPipelineGenerator} - The generator instance for chaining
   */
  addStage(stage) {
    this.stages.push(stage);
    return this;
  }

  /**
   * Add a test stage to the pipeline
   * @param {string} command - Test command to run
   * @param {string} image - Docker image to use for testing
   * @returns {K8sPipelineGenerator} - The generator instance for chaining
   */
  addTestStage(command = 'npm test', image = 'node:14') {
    this.addStage({
      name: 'test',
      steps: [
        {
          name: 'run-tests',
          image: image,
          command: ['sh', '-c', command]
        }
      ]
    });
    return this;
  }

  /**
   * Add a build stage to the pipeline
   * @param {string} buildCommand - Build command to run
   * @param {string} image - Docker image to use for building
   * @returns {K8sPipelineGenerator} - The generator instance for chaining
   */
  addBuildStage(buildCommand = 'npm run build', image = 'node:14') {
    this.addStage({
      name: 'build',
      steps: [
        {
          name: 'build-app',
          image: image,
          command: ['sh', '-c', buildCommand]
        }
      ]
    });
    return this;
  }

  /**
   * Add a Docker build stage to the pipeline
   * @param {string} imageName - Name of the Docker image
   * @param {string} tag - Docker image tag (default: latest)
   * @returns {K8sPipelineGenerator} - The generator instance for chaining
   */
  addDockerBuildStage(imageName, tag = 'latest') {
    const imageTag = `${this.dockerRegistry}/${imageName}:${tag}`;
    
    this.addStage({
      name: 'docker-build',
      steps: [
        {
          name: 'build-and-push',
          image: 'docker:20.10.12-dind',
          command: [
            'sh', '-c',
            `docker build -t ${imageTag} -f ${this.dockerfilePath} . && docker push ${imageTag}`
          ],
          env: [
            { name: 'DOCKER_HOST', value: 'tcp://localhost:2375' }
          ]
        }
      ]
    });
    return this;
  }

  /**
   * Add a Kubernetes deployment stage to the pipeline
   * @param {string} environment - Environment to deploy to (dev, staging, prod)
   * @param {Object} resources - Kubernetes resources to deploy
   * @returns {K8sPipelineGenerator} - The generator instance for chaining
   */
  addDeployStage(environment = 'dev', resources = {}) {
    if (!this.environments.includes(environment)) {
      throw new Error(`Environment ${environment} is not valid. Use one of: ${this.environments.join(', ')}`);
    }

    this.addStage({
      name: `deploy-to-${environment}`,
      steps: [
        {
          name: 'kubectl-apply',
          image: 'bitnami/kubectl:latest',
          command: ['sh', '-c', 'kubectl apply -f /workspace/k8s/${ENVIRONMENT}/']
        }
      ],
      env: [
        { name: 'ENVIRONMENT', value: environment }
      ]
    });
    return this;
  }

  /**
   * Generate a Jenkinsfile for the pipeline
   * @returns {string} - Generated Jenkinsfile content
   */
  generateJenkinsfile() {
    let jenkinsfileContent = `
pipeline {
  agent {
    kubernetes {
      yaml '''
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: ${this.projectName}-pipeline
spec:
  containers:
  - name: jnlp
    image: jenkins/inbound-agent:4.11.2-4
  - name: docker
    image: docker:20.10.12-dind
    securityContext:
      privileged: true
    volumeMounts:
    - name: docker-socket
      mountPath: /var/run/docker.sock
  - name: kubectl
    image: bitnami/kubectl:latest
    command:
    - cat
    tty: true
  volumes:
  - name: docker-socket
    hostPath:
      path: /var/run/docker.sock
      type: Socket
'''
    }
  }
  
  environment {
    PROJECT_NAME = "${this.projectName}"
    DOCKER_REGISTRY = "${this.dockerRegistry}"
    NAMESPACE = "${this.namespace}"
    GIT_BRANCH = "${this.branch}"
  }
  
  stages {
`;

    // Add Git checkout stage
    jenkinsfileContent += `
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
`;

    // Add custom stages
    this.stages.forEach(stage => {
      jenkinsfileContent += `
    stage('${stage.name}') {
      steps {
        container('${stage.steps[0].image.split(':')[0]}') {
          sh """
            ${stage.steps[0].command[2]}
          """
        }
      }
    }
`;
    });

    // Close the Jenkinsfile
    jenkinsfileContent += `
  }
  
  post {
    always {
      cleanWs()
    }
    success {
      echo 'Pipeline completed successfully!'
    }
    failure {
      echo 'Pipeline failed!'
    }
  }
}
`;

    return jenkinsfileContent;
  }

  /**
   * Generate AWS CodePipeline configuration
   * @returns {Object} - AWS CodePipeline configuration object
   */
  generateAwsCodePipeline() {
    const pipelineName = `${this.projectName}-pipeline`;
    const region = this.registry.aws.region;
    const accountId = this.registry.aws.accountId;
    const ecrRepo = this.registry.aws.ecrRepository;
    
    // Create CodePipeline structure
    const pipeline = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: `AWS CodePipeline for ${this.projectName} Kubernetes deployment`,
      Resources: {
        ArtifactBucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            VersioningConfiguration: {
              Status: 'Enabled'
            }
          }
        },
        CodeBuildServiceRole: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: {
                  Service: 'codebuild.amazonaws.com'
                },
                Action: 'sts:AssumeRole'
              }]
            },
            ManagedPolicyArns: [
              'arn:aws:iam::aws:policy/AmazonECR-FullAccess',
              'arn:aws:iam::aws:policy/AmazonS3FullAccess'
            ]
          }
        },
        CodePipelineServiceRole: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: {
                  Service: 'codepipeline.amazonaws.com'
                },
                Action: 'sts:AssumeRole'
              }]
            },
            ManagedPolicyArns: [
              'arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess',
              'arn:aws:iam::aws:policy/AmazonS3FullAccess',
              'arn:aws:iam::aws:policy/AmazonECR-FullAccess'
            ]
          }
        },
        DockerBuildProject: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Name: `${this.projectName}-docker-build`,
            ServiceRole: { 'Fn::GetAtt': ['CodeBuildServiceRole', 'Arn'] },
            Artifacts: {
              Type: 'CODEPIPELINE'
            },
            Environment: {
              Type: 'LINUX_CONTAINER',
              ComputeType: 'BUILD_GENERAL1_SMALL',
              Image: 'aws/codebuild/amazonlinux2-x86_64-standard:3.0',
              PrivilegedMode: true
            },
            Source: {
              Type: 'CODEPIPELINE',
              BuildSpec: this.generateBuildSpec()
            }
          }
        },
        KubernetesDeployProject: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Name: `${this.projectName}-k8s-deploy`,
            ServiceRole: { 'Fn::GetAtt': ['CodeBuildServiceRole', 'Arn'] },
            Artifacts: {
              Type: 'CODEPIPELINE'
            },
            Environment: {
              Type: 'LINUX_CONTAINER',
              ComputeType: 'BUILD_GENERAL1_SMALL',
              Image: 'aws/codebuild/amazonlinux2-x86_64-standard:3.0'
            },
            Source: {
              Type: 'CODEPIPELINE',
              BuildSpec: this.generateDeployBuildSpec()
            }
          }
        },
        Pipeline: {
          Type: 'AWS::CodePipeline::Pipeline',
          Properties: {
            Name: pipelineName,
            RoleArn: { 'Fn::GetAtt': ['CodePipelineServiceRole', 'Arn'] },
            ArtifactStore: {
              Type: 'S3',
              Location: { Ref: 'ArtifactBucket' }
            },
            Stages: [
              {
                Name: 'Source',
                Actions: [{
                  Name: 'Source',
                  ActionTypeId: {
                    Category: 'Source',
                    Owner: 'AWS',
                    Provider: 'CodeStarSourceConnection',
                    Version: '1'
                  },
                  Configuration: {
                    ConnectionArn: '{{CONNECTION_ARN}}', // Replace with actual connection ARN
                    FullRepositoryId: this.repoUrl.replace(/^.*github.com\//, ''),
                    BranchName: this.branch
                  },
                  OutputArtifacts: [{
                    Name: 'SourceCode'
                  }]
                }]
              },
              {
                Name: 'Build',
                Actions: [{
                  Name: 'BuildAndPushDockerImage',
                  ActionTypeId: {
                    Category: 'Build',
                    Owner: 'AWS',
                    Provider: 'CodeBuild',
                    Version: '1'
                  },
                  Configuration: {
                    ProjectName: { Ref: 'DockerBuildProject' }
                  },
                  InputArtifacts: [{
                    Name: 'SourceCode'
                  }],
                  OutputArtifacts: [{
                    Name: 'BuildOutput'
                  }]
                }]
              },
              {
                Name: 'Deploy',
                Actions: [{
                  Name: 'DeployToKubernetes',
                  ActionTypeId: {
                    Category: 'Build',
                    Owner: 'AWS',
                    Provider: 'CodeBuild',
                    Version: '1'
                  },
                  Configuration: {
                    ProjectName: { Ref: 'KubernetesDeployProject' }
                  },
                  InputArtifacts: [{
                    Name: 'BuildOutput'
                  }]
                }]
              }
            ]
          }
        }
      },
      Outputs: {
        PipelineUrl: {
          Description: 'URL to the AWS CodePipeline console',
          Value: {
            'Fn::Sub': `https://\${AWS::Region}.console.aws.amazon.com/codepipeline/home?region=\${AWS::Region}#/view/${pipelineName}`
          }
        }
      }
    };

    return pipeline;
  }

  /**
   * Generate AWS CodeBuild buildspec for Docker build
   * @returns {string} - AWS CodeBuild buildspec.yml content
   */
  generateBuildSpec() {
    const region = this.registry.aws.region;
    const accountId = this.registry.aws.accountId;
    const ecrRepo = this.registry.aws.ecrRepository;
    
    return yaml.dump({
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            'echo Logging in to Amazon ECR...',
            `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${accountId}.dkr.ecr.${region}.amazonaws.com`,
            'echo Checking if repository exists...',
            `aws ecr describe-repositories --repository-names ${ecrRepo} || aws ecr create-repository --repository-name ${ecrRepo}`,
            'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            'IMAGE_TAG=${COMMIT_HASH:=latest}'
          ]
        },
        build: {
          commands: [
            'echo Build started on `date`',
            `echo Building the Docker image: ${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:$IMAGE_TAG`,
            `docker build -t ${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:$IMAGE_TAG -f ${this.dockerfilePath} .`,
            `docker tag ${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:$IMAGE_TAG ${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:latest`
          ]
        },
        post_build: {
          commands: [
            'echo Build completed on `date`',
            'echo Pushing the Docker image...',
            `docker push ${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:$IMAGE_TAG`,
            `docker push ${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:latest`,
            'echo Writing artifact files...',
            'echo "{\"ImageURI\":\"'${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepo}:$IMAGE_TAG'\"}" > imageDefinition.json',
            'echo Generating Kubernetes manifests...',
            'mkdir -p kubernetes/',
            'envsubst < k8s/deployment.yaml > kubernetes/deployment.yaml',
            'envsubst < k8s/service.yaml > kubernetes/service.yaml'
          ]
        }
      },
      artifacts: {
        files: [
          'imageDefinition.json',
          'appspec.yaml',
          'kubernetes/**/*',
          'k8s/**/*'
        ]
      }
    });
  }

  /**
   * Generate AWS CodeBuild buildspec for Kubernetes deployment
   * @returns {string} - AWS CodeBuild buildspec.yml content
   */
  generateDeployBuildSpec() {
    return yaml.dump({
      version: '0.2',
      phases: {
        install: {
          commands: [
            'echo Installing kubectl...',
            'curl -o kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.21.2/2021-07-05/bin/linux/amd64/kubectl',
            'chmod +x ./kubectl',
            'mv ./kubectl /usr/local/bin/kubectl'
          ]
        },
        pre_build: {
          commands: [
            'echo Configuring kubectl...',
            'aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}'
          ]
        },
        build: {
          commands: [
            'echo Deployment started on `date`',
            'echo Updating image in Kubernetes manifests...',
            'IMAGE_URI=$(cat imageDefinition.json | jq -r \'.ImageURI\')',
            'sed -i "s|IMAGE_PLACEHOLDER|$IMAGE_URI|g" kubernetes/deployment.yaml',
            'echo Applying Kubernetes manifests...',
            'kubectl apply -f kubernetes/deployment.yaml -n ${NAMESPACE}',
            'kubectl apply -f kubernetes/service.yaml -n ${NAMESPACE}'
          ]
        },
        post_build: {
          commands: [
            'echo Deployment completed on `date`',
            'kubectl get pods -n ${NAMESPACE}',
            'kubectl get services -n ${NAMESPACE}'
          ]
        }
      }
    });
  }

  /**
   * Generate Kubernetes deployment YAML file
   * @param {string} imageName - Docker image name
   * @param {string} tag - Docker image tag
   * @param {Object} resources - Kubernetes resources to request
   * @returns {string} - Kubernetes deployment YAML
   */
  generateK8sDeployment(imageName, tag = 'latest', resources = { cpu: '100m', memory: '128Mi' }) {
    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: this.projectName,
        namespace: this.namespace,
        labels: {
          app: this.projectName
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: this.projectName
          }
        },
        template: {
          metadata: {
            labels: {
              app: this.projectName
            }
          },
          spec: {
            containers: [
              {
                name: this.projectName,
                image: 'IMAGE_PLACEHOLDER', // This will be replaced during deployment
                imagePullPolicy: 'Always',
                ports: [
                  {
                    containerPort: 8080
                  }
                ],
                resources: {
                  requests: resources
                }
              }
            ]
          }
        }
      }
    };

    return yaml.dump(deployment);
  }

  /**
   * Generate Kubernetes service YAML file
   * @param {number} port - Service port
   * @param {number} targetPort - Container port to target
   * @param {string} type - Service type (ClusterIP, NodePort, LoadBalancer)
   * @returns {string} - Kubernetes service YAML
   */
  generateK8sService(port = 80, targetPort = 8080, type = 'ClusterIP') {
    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: this.projectName,
        namespace: this.namespace,
        labels: {
          app: this.projectName
        }
      },
      spec: {
        type: type,
        ports: [
          {
            port: port,
            targetPort: targetPort,
            protocol: 'TCP'
          }
        ],
        selector: {
          app: this.projectName
        }
      }
    };

    return yaml.dump(service);
  }

  /**
   * Save pipeline configuration files to disk
   * @param {string} outputDir - Directory to save files
   * @returns {Object} - Object with paths to generated files
   */
  saveToFiles(outputDir = './pipeline') {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create directories for Kubernetes manifests
    const k8sDir = path.join(outputDir, 'k8s');
    if (!fs.existsSync(k8sDir)) {
      fs.mkdirSync(k8sDir, { recursive: true });
    }

    // Create environment directories
    this.environments.forEach(env => {
      const envDir = path.join(k8sDir, env);
      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }
    });

    // Save Jenkinsfile
    const jenkinsfilePath = path.join(outputDir, 'Jenkinsfile');
    fs.writeFileSync(jenkinsfilePath, this.generateJenkinsfile());

    // Save AWS CodePipeline template
    const awsCodePipelinePath = path.join(outputDir, 'aws-codepipeline.yaml');
    fs.writeFileSync(awsCodePipelinePath, yaml.dump(this.generateAwsCodePipeline()));

    // Save buildspec files
    const buildspecPath = path.join(outputDir, 'buildspec.yml');
    fs.writeFileSync(buildspecPath, this.generateBuildSpec());

    const deployBuildspecPath = path.join(outputDir, 'deploy-buildspec.yml');
    fs.writeFileSync(deployBuildspecPath, this.generateDeployBuildSpec());

    // Save Kubernetes manifest templates for each environment
    this.environments.forEach(env => {
      const envDir = path.join(k8sDir, env);
      
      // Save deployment.yaml
      const deploymentPath = path.join(envDir, 'deployment.yaml');
      fs.writeFileSync(deploymentPath, this.generateK8sDeployment(`${this.projectName}-${env}`));

      // Save service.yaml
      const servicePath = path.join(envDir, 'service.yaml');
      fs.writeFileSync(servicePath, this.generateK8sService());
    });

    return {
      jenkinsfilePath,
      awsCodePipelinePath,
      buildspecPath,
      deployBuildspecPath,
      k8sDir
    };
  }
}

module.exports = K8sPipelineGenerator;
