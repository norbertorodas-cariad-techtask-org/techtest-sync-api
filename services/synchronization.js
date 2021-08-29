const config = require('../config');
const axios = require("axios");
const crypto = require("crypto")


const { WEBHOOK_SECRET } = process.env;

function validateJsonWebhook(request) {

    // calculate the signature
    const expectedSignature = "sha1=" +
        crypto.createHmac("sha1", WEBHOOK_SECRET)
            .update(JSON.stringify(request.body))
            .digest("hex");

    // compare the signature against the one in the request
    const signature = request.headers["x-hub-signature"];
    if (signature !== expectedSignature) {
        throw new Error("Invalid signature.");
    }
}

// handle the issue event coming from github webhoook
async function handle(issuesEventPayload){
    console.log('[INFO] - synchronization handle')

    if (issuesEventPayload.action == 'opened'){
        console.log('[INFO] The issue event\'s is %s ', issuesEventPayload.action)
        let artifactoryRepoResponse = await getArtifactoryRepository(issuesEventPayload)

        await internalArtifactoryRepositoryHandling(issuesEventPayload, artifactoryRepoResponse)
    }
    else {
        console.log('[INFO] The issue event\'s action is not \'opened\'. Nothing to do because action is \'%s\'', issuesEventPayload.action)
    }
}

//Return a repository entity from artifactory
async function getArtifactoryRepository(issuesEventPayload) {
    console.log('[INFO] - getArtifactoryRepository')
    console.log('[INFO] - getArtifactoryRepository - repository.name= ' + issuesEventPayload.repository.name)

    const url = config.artifactory.host + "repositories/" + issuesEventPayload.repository.name;
    try {
      const response = await axios.get(url, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey}})
      return response
    }
    catch (error) {
        if(error.response.status == 400) {
            console.log('[INFO] - getArtifactoryRepository - %s not found', issuesEventPayload.repository.name)
        } else {
            console.log('[ERROR] - getArtifactoryRepository $s', error.response.data)
        }
    }
  }

  async function internalArtifactoryRepositoryHandling(issuesEventPayload, artifactoryResponse) {
    console.log('[INFO] - internalArtifactoryRepositoryHandling ')

    if (artifactoryResponse.status != 200) {
        let createArtRepoResponse = await createArtifactoryRepository(issuesEventPayload)
        if(createArtRepoResponse.status == 200) {
            const internalArtifactoryGroupsHandlingResponse = await internalArtifactoryGroupsHandling(issuesEventPayload)
        }
    } else {
        const internalArtifactoryGroupsHandlingResponse = await internalArtifactoryGroupsHandling(issuesEventPayload)
    }
}

async function createArtifactoryRepository(issuesEventPayload) {
    console.log('[INFO] - createArtifactoryRepository ')
    const url = config.artifactory.host + "repositories/" + issuesEventPayload.repository.name;

    const payload = {
        'key': issuesEventPayload.repository.name,
        "packageType": "generic", // for testing purposes
        "propertySets": ["artifactory"],
        "rclass" : "local"
    }

    try {
        const response = await axios.put(url, payload, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey, "Content-Type": "application/json"}});
        return response
    }
    catch (error) {
        console.log(error.response.data);
    }
}

async function internalArtifactoryGroupsHandling(issuesEventPayload) {
    console.log('[INFO] - internalArtifactoryGroupsHandling')

    let getGithubTeamsPerRepoResponse = await getGithubTeamsPerRepository(issuesEventPayload)
    let ghTeamsListPerRepo = getGithubTeamsPerRepoResponse.data

    for (let githubTeam of ghTeamsListPerRepo) {
        let getArtifactoryGroupResponse = await getArtifactoryGroupByName(githubTeam.name)
        let userNames = await createUpdateArtifactoryUsers(githubTeam, issuesEventPayload)

        if (getArtifactoryGroupResponse.status == 404){
            let createArtifactoryGroupResponse = await createArtifactoryGroup(team.name, userNames)
            const handlePermissionTargetInArtifactoryPerRepoAndGroupResponse = await handlePermissionTargetInArtifactoryPerRepoAndGroup(issuesEventPayload.repository.name, team.name, githubTeam.permissions)
        } else if (getArtifactoryGroupResponse.status == 200){
            const updateArtifactoryGroupPerRepoAndGroupResponse = await updateArtifactoryGroup(getArtifactoryGroupResponse.data, userNames)
            const handlePermissionTargetInArtifactoryPerRepoAndGroupResponse = await handlePermissionTargetInArtifactoryPerRepoAndGroup(issuesEventPayload.repository.name, team.name, githubTeam.permissions)
        }
    }
}

async function getGithubTeamsPerRepository(issuesEventPayload) {
    console.log('[INFO] - getGithubTeamsPerRepository')
    console.log('[INFO] - getGithubTeamsPerRepository - repository.name= ' + issuesEventPayload.repository.name)

    const url = config.github.host + "api/" + issuesEventPayload.organization.login + '/' + issuesEventPayload.repository.name + '/teams' ;
    try {
      const response = await axios.get(url, { headers: { "Authorization": config.github.token }})
      return response
    }
    catch (error) {
        if(error.response.status == 400) {
            console.log('[INFO] - getGithubTeamsPerRepository - %s not found', issuesEventPayload.repository.name)
        } else {
            console.log('[ERROR] - getGithubTeamsPerRepository $s', error.response.data)
        }
    }
}

async function getArtifactoryGroupByName(name) {
    console.log('[INFO] - getArtifactoryGroupByName')

    const url = config.artifactory.host + 'api/security/groups/' + name;

    try {
      const response = await axios.get(url, { headers: { "Authorization": config.github.token }})
      return response
    }
    catch (error) {
        if(error.response.status == 400) {
            console.log('[INFO] - getArtifactoryGroupByName - %s not found', name)
        } else {
            console.log('[ERROR] - getArtifactoryGroupByName $s', error.response.data)
        }
    }
}

async function createArtifactoryGroup(groupName, userNames) {
    console.log('[INFO] - createArtifactoryGroup ')
    const url = config.artifactory.host + "api/security/groups/" + groupName;
    let membersList = [{"value": "anonymous", "display": "anonymous"}]

    for (let userName of userNames){
        membersList.push({ "value": userName, "display": userName })
    }

    const payload = {
        "displayName": groupName,
        "id": groupName,
        "members": membersList,
        "schemas": [
            "urn:ietf:params:scim:schemas:core:2.0:Group"
        ],
        "meta": {
            "resourceType": "Group"
        }
     }

    try {
        const response = await axios.put(url, payload, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey, "Content-Type": "application/json"}});
        return response
    }
    catch (error) {
        console.log(error.response.data);
    }
}

async function updateArtifactoryGroup(artifactoryGroup, userNames) {
    console.log('[INFO] - UpdateArtifactoryGroup ')
    const url = config.artifactory.host + "api/security/groups/" + groupName;

    artifactoryGroup.userNames = userNames

    try {
        const response = await axios.put(url, artifactoryGroup, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey, "Content-Type": "application/json"}});
        return response
    }
    catch (error) {
        console.log(error.response.data);
    }
}

async function createUpdateArtifactoryUsers(githubTeam) {
    console.log('[INFO] - createUpdateArtifactoryUsers')

    let githubTeamMembersResponse = await getGithubTeamMembers(githubTeam.name, issuesEventPayload.organization.login)
    let userNameList = []

    for(let githubTeamMember of githubTeamMembersResponse.data) {
        const artifactoryUserResponse = await getArtifactoryUserByName(githubTeamMember.name)
        if (artifactoryUserResponse.status == 404) {
            const internalCreateArtifactoryUserResponse = await internalCreateArtifactoryUser(githubTeamMember)
        }
        //this list is needed to create/update an artifactory group. Represents all the users associated to the group
        userNameList.push(githubTeamMember.name)
    }

    return userNameList
}

async function getGithubTeamMembers(githubTeamName, organizationName) {
    console.log('[INFO] - getGithubTeamMembers')
    console.log('[INFO] - getGithubTeamMembers - team= ' + githubTeamName)

    const url = config.github.host + "orgs/" + organizationName + '/' + githubTeamName + '/members' ;
    try {
      const response = await axios.get(url, { headers: { "Authorization": config.github.token }})
      return response
    }
    catch (error) {
        if(error.response.status == 400) {
            console.log('[INFO] - getGithubTeamMembers - %s not found', issuesEventPayload.repository.name)
        } else {
            console.log('[ERROR] - getGithubTeamMembers $s', error.response.data)
        }
    }
}

async function getArtifactoryUserByName(name) {
    console.log('[INFO] - getArtifactoryUserByName')

    const url = config.artifactory.host + 'api/security/users/' + name;

    try {
      const response = await axios.get(url, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey}})
      return response
    }
    catch (error) {
        console.log('[ERROR] - getArtifactoryUserByName $s', error.response.data)
    }
}

async function internalCreateArtifactoryUser(githubTeamMember){
    const url = config.artifactory.host + '/api/v1/scim/v2/Users'
    let payload = {
        "schemas": [
          "urn:ietf:params:scim:schemas:core:2.0:User"
        ],
        "userName": githubTeamMember.name,
        "active": true,
        "emails": [
          {
            "value": githubTeamMember.email,
            "primary": true
          }
        ]
      }

    try {
        const response = await axios.post(url, payload, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey, "Content-Type": "application/json"}});
        return response
    }
    catch (error) {
        console.log(error.response.data);
    }
}

async function handlePermissionTargetInArtifactoryPerRepoAndGroup(repositoryName, groupName, githubTeamPermissions) {
    console.log('[INFO] - handlePermissionTargetInArtifactoryPerRepoAndGroup')
    const permissionTargetName = repositoryName + '-' + groupName + '-pt'

    const permissionsInArtifactory = await mapPermissionsBetweenGithubAndArtifactory(githubTeamPermissions)

    newPermissionTarget = {}
    newPermissionTarget.name = permissionTargetName
    newPermissionTarget.repo.actions.groups = {}
    newPermissionTarget.repo.actions.groups[repositoryName] = permissionsInArtifactory
    newPermissionTarget.repo.repositories = [ repositoryName ]

    //the endpoints creates a new one or replace the existent one
    const url = config.artifactory.host + 'api/v2/security/permissions/populateCaches'

    try {
        const response = await axios.post(url, newPermissionTarget, {headers: {"X-JFrog-Art-Api": config.artifactory.apiKey, "Content-Type": "application/json"}});
        return response
    }
    catch (error) {
        console.log(error.response.data);
    }
}

async function mapPermissionsBetweenGithubAndArtifactory(githubTeamPermissions) {
    let githubPushMapping = ['read', 'annotate', 'write', 'delete']
    let githubPullMapping = ['read', 'annotate']
    let artifactoryPermissionsResultList = new Set()

    for (let ghPermission of githubTeamPermissions){
        if (ghPermission == 'push') {
            artifactoryPermissionsResultList.add(githubPushMapping)
        } else  if (ghPermission == 'pull'){
            artifactoryPermissionsResultList.add(githubPullMapping)
        }
    }

    return artifactoryPermissionsResultList
}

module.exports = {
  handle
}
